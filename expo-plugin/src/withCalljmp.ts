import { ConfigPlugin, createRunOncePlugin } from 'expo/config-plugins';

const withCalljmp: ConfigPlugin = config => {
  return config;
};

export default createRunOncePlugin(
  withCalljmp,
  '@calljmp/react-native',
  '0.0.50'
);
