import { AppAction, AppState, ThunkState, ThunkDispatch } from '~/types/redux'
import { getBookmarks, actions as bookmarkActions } from './bookmarks'
import { getToken } from './auth'
import {
  transformExportBookmarks,
  validateBookmark,
  generateBookmarkGuid,
  transformImportBookmark,
  expandBookmarks,
} from '~/helpers'
import { createBackup } from '~/api/createBackup'
import { updateBackup } from '~/api/updateBackup'
import {
  restoreGistAnonymously,
  restoreGistAuthenticated,
} from '~/api/restoreBackup'
import { getAutoUpdateBackup } from './settings'
import { groomGithubResponse } from '../../api/util/groomGithubResponse'

export type BackupState = Partial<{
  backupFilename: string
  backupDescription: string
  backupUrl: string
  backupGistID: string
  backupReadOnly: boolean
  backupLoading: boolean
}>

export const initialState: BackupState = {
  backupReadOnly: false,
  backupLoading: false,
}

export const actions = {
  setFilename: (filename: string) => ({
    type: 'SET_BACKUP_FILENAME',
    payload: filename,
  }),
  setDescription: (description: string) => ({
    type: 'SET_BACKUP_DESCRIPTION',
    payload: description,
  }),
  setUrl: (url: string) => ({
    type: 'SET_BACKUP_URL',
    payload: url,
  }),
  setGistId: (gistId: string) => ({
    type: 'SET_BACKUP_GIST_ID',
    payload: gistId,
  }),
  clearBackup: () => ({
    type: 'CLEAR_BACKUP',
  }),
  setReadOnly: (readOnly: boolean) => ({
    type: 'BACKUP_READ_ONLY',
    payload: readOnly,
  }),
  setBackupLoading: (loading: boolean) => ({
    type: 'BACKUP_LOADING',
    payload: loading,
  }),
}

export function reducer(state: BackupState = initialState, action: AppAction) {
  switch (action.type) {
    case 'SET_BACKUP_FILENAME':
      return {
        ...state,
        backupFilename: action.payload,
      }
    case 'SET_BACKUP_DESCRIPTION':
      return {
        ...state,
        backupDescription: action.payload,
      }
    case 'SET_BACKUP_URL':
      return {
        ...state,
        backupUrl: action.payload,
      }
    case 'SET_BACKUP_GIST_ID':
      return {
        ...state,
        backupGistID: action.payload,
      }
    case 'BACKUP_READ_ONLY':
      return {
        ...state,
        backupReadOnly: action.payload,
      }
    case 'BACKUP_LOADING':
      return {
        ...state,
        backupLoading: action.payload,
      }
    case 'CLEAR_BACKUP':
      return initialState
    default:
      return state
  }
}

export const getBackup = (state: AppState) => state.backup

export const getBackupExists = (state: AppState) =>
  !!(
    state.backup &&
    state.backup.backupFilename &&
    state.backup.backupGistID &&
    state.backup.backupUrl
  )

export const getBackupFilename = (state: AppState) =>
  state.backup.backupFilename

export const getBackupDescription = (state: AppState) =>
  state.backup.backupDescription
export const getBackupUrl = (state: AppState) => state.backup.backupUrl

export const getBackupGistId = (state: AppState) => state.backup.backupGistID

export const getBackupReadOnly = (state: AppState) =>
  state.backup.backupReadOnly

export const getBackupLoading = (state: AppState) => state.backup.backupLoading

export function createBackupThunk(
  filename: string,
  isPublic: boolean,
  description?: string
) {
  return async (dispatch: ThunkDispatch, getState: ThunkState) => {
    dispatch(actions.setBackupLoading(true))
    const bookmarks = getBookmarks(getState())
    const token = getToken(getState())

    const minifiedBookmarks = transformExportBookmarks(bookmarks)

    // Add a .json to the end of the filename
    // TODO: We should check if the user has already done this
    const filenameWithExtension = `${filename}.json`

    if (token) {
      try {
        const resp = await createBackup(
          token,
          filenameWithExtension,
          isPublic,
          minifiedBookmarks,
          description
        )

        const { id, html_url } = resp.data

        dispatch(actions.setGistId(id))
        dispatch(actions.setUrl(html_url))
        dispatch(actions.setFilename(filenameWithExtension))

        if (description) {
          dispatch(actions.setDescription(description))
        }
      } catch {
        alert('There was an error backing up your bookmarks')
      }
    } else {
      alert('Could not create backup, missing token')
    }
    dispatch(actions.setBackupLoading(false))
  }
}

// Just like regular update but this one does not
// Yell at you. For creating / updating bookmarks
export function passiveUpdate() {
  return async (dispatch: ThunkDispatch, getState: ThunkState) => {
    const passiveUpdateEnabled = getAutoUpdateBackup(getState())
    const backupReadOnly = getBackupReadOnly(getState())
    if (!passiveUpdateEnabled || backupReadOnly) {
      return
    }
    dispatch(actions.setBackupLoading(true))
    const token = getToken(getState())
    const filename = getBackupFilename(getState())
    const gistId = getBackupGistId(getState())

    if (token && filename && gistId) {
      const bookmarks = getBookmarks(getState())
      const minifiedBookmarks = transformExportBookmarks(bookmarks)
      const description = getBackupDescription(getState())

      try {
        await updateBackup(
          token,
          filename,
          false,
          minifiedBookmarks,
          gistId,
          description
        )
      } catch {
        console.warn('An error has occurred updating bookmarks')
      }
    }
    dispatch(actions.setBackupLoading(false))
  }
}

// Whenever the user opens thier copy of bookmarks
// Automatically check if there have been any changes and apply those
// Changes
export function passivePullUpdates() {
  return async (dispatch: ThunkDispatch, getState: ThunkState) => {
    dispatch(actions.setBackupLoading(true))
    const token = getToken(getState())
    const gistId = getBackupGistId(getState())
    const filename = getBackupFilename(getState())

    if (token && gistId && filename) {
      const resp = await restoreGistAuthenticated(gistId, token)
      // Grab the content out of the response and parse it
      const { content } = resp.data.files[filename]
      const bookmarks = JSON.parse(content)
      // Validate + expand bookmarks
      let expandedBookmarks = {}
      bookmarks.map((bookmark: any) => {
        if (validateBookmark(bookmark)) {
          // Once the bookmark is validated we then create a fresh
          // guid for the bookmark and expand it
          const freshGuid = generateBookmarkGuid()
          const expandedBookmark = transformImportBookmark(bookmark, freshGuid)

          // Convert to a structure understood by the app
          expandedBookmarks = {
            ...expandedBookmarks,
            [expandedBookmark.guid]: expandedBookmark,
          }
        }
      })
      dispatch(bookmarkActions.setBookmarks(expandedBookmarks))
    }

    dispatch(actions.setBackupLoading(false))
  }
}

// Just like abovce function
// Without auth
// Only works for public gists
export function passivePullAnonymousUpdates() {
  return async (dispatch: ThunkDispatch, getState: ThunkState) => {
    const gistId = getBackupGistId(getState())
    if (gistId) {
      dispatch(actions.setBackupLoading(true))
      try {
        const resp = await restoreGistAnonymously(gistId)
        const gistData = groomGithubResponse(resp.data)

        const { backup, filename, desc } = gistData

        const expandedBookmarks = expandBookmarks(backup)

        dispatch(bookmarkActions.setBookmarks(expandedBookmarks))
        dispatch(actions.setFilename(filename))
        dispatch(actions.setDescription(desc))
        dispatch(actions.setReadOnly(true))
      } catch {
        console.warn('Coult not restore bookmarks!')
      }
      dispatch(actions.setBackupLoading(false))
    }
  }
}

export function updateBackupThunk() {
  return async (dispatch: ThunkDispatch, getState: ThunkState) => {
    dispatch(actions.setBackupLoading(true))
    const bookmarks = getBookmarks(getState())
    const token = getToken(getState())
    const filename = getBackupFilename(getState())
    const description = getBackupDescription(getState())
    const gistId = getBackupGistId(getState())

    const minifiedBookmarks = transformExportBookmarks(bookmarks)

    if (token && filename && gistId) {
      try {
        await updateBackup(
          token,
          filename,
          false,
          minifiedBookmarks,
          gistId,
          description
        )
      } catch {
        alert('Could not update bookmarks')
      }
    } else {
      alert('Could not update bookmarks')
    }
    dispatch(actions.setBackupLoading(false))
  }
}

// TODO: Implement Later
// If the user is authenticated and the gist belongs to them
// We can restore the gist and hook it up so  the user backs up to
// It on the next backup
export function restoreBackupAuthenticatedThunk(gistId: string) {
  return async (dispatch: ThunkDispatch, getState: ThunkState) => {
    dispatch(actions.setBackupLoading(true))
    try {
      const token = getToken(getState())
      if (!token) {
        throw 'Token not found'
      }
      const resp = await restoreGistAuthenticated(gistId, token)
      // For now our backups only contain a single file
      // We get the filename by getting the first key in
      // the files object of the gist response
      const filename = Object.keys(resp.data.files)[0]
      // Grab the content out of the response and parse it
      const { content } = resp.data.files[filename]
      const bookmarks = JSON.parse(content)
      // Validate + expand bookmarks
      let expandedBookmarks = {}
      bookmarks.map((bookmark: any) => {
        if (validateBookmark(bookmark)) {
          // Once the bookmark is validated we then create a fresh
          // guid for the bookmark and expand it
          const freshGuid = generateBookmarkGuid()
          const expandedBookmark = transformImportBookmark(bookmark, freshGuid)

          // Convert to a structure understood by the app
          expandedBookmarks = {
            ...expandedBookmarks,
            [expandedBookmark.guid]: expandedBookmark,
          }
        }
      })
      dispatch(bookmarkActions.setBookmarks(expandedBookmarks))
      dispatch(actions.setFilename(filename))
      dispatch(actions.setGistId(gistId))
      dispatch(actions.setDescription(resp.data.description))
      dispatch(actions.setUrl(resp.data.html_url))
      alert('Import success!')
    } catch {
      alert('Could not restore bookmarks')
    }
    dispatch(actions.setBackupLoading(false))
  }
}

// If the user is not authenticated we can restore an anonymous gist
// However we do not hook it up for backup as the user does not own that
// Gist
export function restoreBackupAnonymouslyThunk(gistId: string) {
  return async (dispatch: ThunkDispatch) => {
    dispatch(actions.setBackupLoading(true))
    try {
      const resp = await restoreGistAnonymously(gistId)
      const gistData = groomGithubResponse(resp.data)

      const { backup, filename, desc, url } = gistData

      const expandedBookmarks = expandBookmarks(backup)

      dispatch(bookmarkActions.setBookmarks(expandedBookmarks))
      dispatch(actions.setFilename(filename))
      dispatch(actions.setGistId(gistId))
      dispatch(actions.setDescription(desc))
      dispatch(actions.setUrl(url))
      dispatch(actions.setReadOnly(true))
      alert('Import success!')
    } catch {
      alert('Could not restore bookmarks')
    }
    dispatch(actions.setBackupLoading(false))
  }
}
