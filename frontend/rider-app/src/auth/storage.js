import * as SecureStore from 'expo-secure-store';

const key = 'riderapp.auth.session.v1';
export const sessionStorage = {
  read: () => SecureStore.getItemAsync(key),
  write: value => value ? SecureStore.setItemAsync(key, value) : SecureStore.deleteItemAsync(key),
};
