import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { signedIn, signedOut } from './authSlice'
import type { TicketInput } from '@/types/tickets'

type DraftState = {
  ownerId: number | null
  values: TicketInput | null
  requestKey: string | null
}
const initialState: DraftState = {
  ownerId: null,
  values: null,
  requestKey: null,
}
const slice = createSlice({
  name: 'requestDraft',
  initialState,
  reducers: {
    saveRequestDraft(
      state,
      action: PayloadAction<{ ownerId: number; values: TicketInput }>,
    ) {
      if (state.ownerId === action.payload.ownerId)
        state.values = action.payload.values
    },
    beginRequestAttempt(
      state,
      action: PayloadAction<{ ownerId: number; key: string }>,
    ) {
      if (state.ownerId === action.payload.ownerId)
        state.requestKey = action.payload.key
    },
    clearRequestDraft(state, action: PayloadAction<number>) {
      if (state.ownerId === action.payload) {
        state.values = null
        state.requestKey = null
      }
    },
  },
  extraReducers: (builder) =>
    builder
      .addCase(signedOut, () => initialState)
      .addCase(signedIn, (state, action) => {
        if (state.ownerId !== action.payload.user.id) {
          state.values = null
          state.requestKey = null
        }
        state.ownerId = action.payload.user.id
      }),
})
export const { saveRequestDraft, clearRequestDraft, beginRequestAttempt } =
  slice.actions
export default slice.reducer
