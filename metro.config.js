// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Support .wasm files for expo-sqlite web
config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];

// Block Node.js-only canvas module used by pdfjs — never runs in React Native
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@napi-rs/canvas') {
    return { type: 'empty' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
