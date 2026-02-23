import AsyncStorage from '@react-native-async-storage/async-storage';

export const readJson = async <T>(key: string, fallbackValue: T): Promise<T> => {
  try {
    const rawValue = await AsyncStorage.getItem(key);
    if (!rawValue) {
      return fallbackValue;
    }

    return JSON.parse(rawValue) as T;
  } catch {
    return fallbackValue;
  }
};

export const writeJson = async <T>(key: string, value: T): Promise<void> => {
  await AsyncStorage.setItem(key, JSON.stringify(value));
};
