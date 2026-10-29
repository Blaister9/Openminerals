import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import type {Storage} from './demo-client';

// Tokens use OS-protected storage on phones. The browser fallback is only for
// local demo QA; passwords are never stored by this adapter.
const keyFor=async(key:string)=>'openminerals-auth-'+await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,key);
export const authStorage:Storage={
  async getItem(key){const name=await keyFor(key);return Platform.OS==='web'?AsyncStorage.getItem(name):SecureStore.getItemAsync(name);},
  async setItem(key,value){
    const name=await keyFor(key);
    if(Platform.OS==='web')await AsyncStorage.setItem(name,value);
    else await SecureStore.setItemAsync(name,value,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
  },
  async removeItem(key){
    const name=await keyFor(key);
    if(Platform.OS==='web')await AsyncStorage.removeItem(name);
    else await SecureStore.deleteItemAsync(name);
  },
};
