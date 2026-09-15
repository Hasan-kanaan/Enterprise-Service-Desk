import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { setAccessToken } from '@/services/api'
import type { AuthUser } from '@/types/auth'

type AuthState = {
  accessToken: string | null
  user: AuthUser | null
}

const initialState: AuthState = { accessToken: null, user: null }

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signedIn: (state, action: PayloadAction<{ accessToken: string; user: AuthUser }>) => {
      state.accessToken = action.payload.accessToken
      state.user = action.payload.user
      setAccessToken(action.payload.accessToken)
    },
    signedOut: (state) => {
      state.accessToken = null
      state.user = null
      setAccessToken(null)
    },
  },
})

export const { signedIn, signedOut } = authSlice.actions
export default authSlice.reducer
