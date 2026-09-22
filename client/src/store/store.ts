import { configureStore } from '@reduxjs/toolkit'
import authReducer, { signedIn, signedOut } from '@/store/authSlice'
import { onSessionChange, setAccessToken } from '@/services/api'
export const store = configureStore({ reducer: { auth: authReducer } })
store.subscribe(() => setAccessToken(store.getState().auth.accessToken))
onSessionChange((session) =>
  store.dispatch(session ? signedIn(session) : signedOut()),
)
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
