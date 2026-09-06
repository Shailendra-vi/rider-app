import { configureStore } from '@reduxjs/toolkit';
import sessionReducer from './sessionSlice';
import outboxReducer from './outboxSlice';

export const store = configureStore({
  reducer: { 
    session: sessionReducer, 
    outbox: outboxReducer 
  },
});
