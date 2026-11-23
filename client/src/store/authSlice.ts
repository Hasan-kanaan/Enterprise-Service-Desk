import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { AuthResponse, AuthUser } from '@/types/auth'

type AuthState = {
  accessToken: string | null
  user: AuthUser | null
  status: 'checking' | 'ready' | 'error'
}
const initialState: AuthState = {
  accessToken: null,
  user: null,
  status: 'checking',
}
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signedIn: (state, action: PayloadAction<AuthResponse>) => {
      state.accessToken = action.payload.accessToken
      state.user = action.payload.user
      state.status = 'ready'
    },
    profileUpdated: (state, action: PayloadAction<Partial<AuthUser>>) => {
      if (state.user) state.user = { ...state.user, ...action.payload }
    },
    signedOut: (state) => {
      state.accessToken = null
      state.user = null
      state.status = 'ready'
    },
    sessionChecking: (state) => {
      state.status = 'checking'
    },
    sessionRestoreFailed: (state) => {
      state.status = 'error'
    },
  },
})
export const { signedIn, signedOut, sessionChecking, sessionRestoreFailed, profileUpdated } =
  authSlice.actions
export default authSlice.reducer
