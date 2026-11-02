import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'

const invoke = vi.fn()
let tauri = true
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))
vi.mock('./useMedia', () => ({
  get IS_TAURI() {
    return tauri
  },
}))

import { useKept } from './keep'

interface Item {
  id: number
  text: string
  note?: string
}
const A: Item = { id: 1, text: 'Lab 8', note: 'submit on SCELE, 2 files' }
const B: Item = { id: 2, text: 'Read ch. 4' }

/** what the file holds, by name; keep_save writes into it like the Rust side does */
let disk: Record<string, string | null>
const saves = (name = 'todos') => invoke.mock.calls.filter((c) => c[0] === 'keep_save' && c[1].name === name).map((c) => JSON.parse(c[1].json))

/** the hook the way App uses it: a list in state that starts as localStorage gave it */
function mount(initial: Item[], name: 'todos' | 'todoGroups' = 'todos') {
  return renderHook(() => {
    const [list, setList] = useState<Item[]>(initial)
    useKept(name, list, setList)
    return { list, setList }
  })
}

beforeEach(() => {
  tauri = true
  disk = { todos: null, todoGroups: null }
  invoke.mockReset()
  invoke.mockImplementation(async (cmd: string, args: { name: string; json?: string }) => {
    if (cmd === 'keep_load') return disk[args.name]
    if (cmd === 'keep_save') {
      disk[args.name] = args.json!
      return
    }
  })
})

describe('restoring after the webview storage was wiped', () => {
  it('brings back to-dos, with their descriptions, when the list starts empty', async () => {
    disk.todos = JSON.stringify([A, B])
    const { result } = mount([])
    await waitFor(() => expect(result.current.list).toEqual([A, B]))
    expect(result.current.list[0].note).toBe('submit on SCELE, 2 files')
  })

  it('brings back groups too', async () => {
    disk.todoGroups = JSON.stringify([{ id: 'g1', name: 'Kuliah' }])
    const { result } = mount([], 'todoGroups')
    await waitFor(() => expect(result.current.list).toHaveLength(1))
  })

  it('does not replace a list localStorage still has', async () => {
    disk.todos = JSON.stringify([B])
    const { result } = mount([A])
    await waitFor(() => expect(saves()).toContainEqual([A]))
    expect(result.current.list).toEqual([A])
    expect(invoke).not.toHaveBeenCalledWith('keep_load', expect.anything())
  })

  it('does not erase the file with an empty list before it has been read', async () => {
    let release!: (v: string) => void
    invoke.mockImplementation((cmd: string) => (cmd === 'keep_load' ? new Promise((r) => (release = r)) : Promise.resolve()))
    const { result } = mount([])
    expect(saves()).toEqual([])
    await act(async () => release(JSON.stringify([A, B])))
    await waitFor(() => expect(result.current.list).toEqual([A, B]))
    expect(saves().every((s) => s.length > 0)).toBe(true)
  })

  it('lets what the user added while the file was loading win', async () => {
    let release!: (v: string) => void
    invoke.mockImplementation((cmd: string) => (cmd === 'keep_load' ? new Promise((r) => (release = r)) : Promise.resolve()))
    const { result } = mount([])
    act(() => result.current.setList([B]))
    await act(async () => release(JSON.stringify([A])))
    expect(result.current.list).toEqual([B])
  })

  it('survives a second wipe: restore, then wipe again, then restore again', async () => {
    disk.todos = JSON.stringify([A])
    const first = mount([])
    await waitFor(() => expect(first.result.current.list).toEqual([A]))
    await waitFor(() => expect(saves()).toContainEqual([A]))
    first.unmount()
    const second = mount([])
    await waitFor(() => expect(second.result.current.list).toEqual([A]))
  })
})

describe('keeping the file current', () => {
  it('writes the first list it sees, so an existing user gets a backup on upgrade', async () => {
    mount([A])
    await waitFor(() => expect(saves()).toEqual([[A]]))
  })

  it('writes every change: add, edit a description, remove', async () => {
    const { result } = mount([A])
    await waitFor(() => expect(saves()).toHaveLength(1))
    act(() => result.current.setList([A, B]))
    await waitFor(() => expect(JSON.parse(disk.todos!)).toEqual([A, B]))
    act(() => result.current.setList([{ ...A, note: 'changed' }, B]))
    await waitFor(() => expect(JSON.parse(disk.todos!)[0].note).toBe('changed'))
    act(() => result.current.setList([]))
    await waitFor(() => expect(JSON.parse(disk.todos!)).toEqual([]))
  })

  it('an empty file after the user deleted everything stays empty (no resurrection)', async () => {
    const { result } = mount([A])
    await waitFor(() => expect(saves()).toHaveLength(1))
    act(() => result.current.setList([]))
    await waitFor(() => expect(JSON.parse(disk.todos!)).toEqual([]))
    const again = mount([])
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('keep_load', { name: 'todos' }))
    expect(again.result.current.list).toEqual([])
  })

  it('keeps to-dos and groups in separate files', async () => {
    mount([A], 'todos')
    mount([{ id: 9, text: 'Kuliah' }], 'todoGroups')
    await waitFor(() => expect(disk.todoGroups).not.toBeNull())
    expect(JSON.parse(disk.todos!)).toEqual([A])
    expect(JSON.parse(disk.todoGroups!)).toEqual([{ id: 9, text: 'Kuliah' }])
  })
})

describe('bad input and other environments', () => {
  it.each([['corrupt', '{not json'], ['not a list', '{"a":1}'], ['empty list', '[]'], ['nothing', null]])('ignores a %s file and still saves later', async (_, text) => {
    disk.todos = text as string | null
    const { result } = mount([])
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('keep_load', { name: 'todos' }))
    expect(result.current.list).toEqual([])
    act(() => result.current.setList([B]))
    await waitFor(() => expect(JSON.parse(disk.todos!)).toEqual([B]))
  })

  it('a failing load or save never throws, and saving resumes', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      throw new Error(cmd)
    })
    const { result } = mount([])
    act(() => result.current.setList([A]))
    expect(result.current.list).toEqual([A])
  })

  it('does nothing outside the app (browser dev server)', async () => {
    tauri = false
    const { result } = mount([])
    act(() => result.current.setList([A]))
    await Promise.resolve()
    expect(invoke).not.toHaveBeenCalled()
    expect(result.current.list).toEqual([A])
  })
})
