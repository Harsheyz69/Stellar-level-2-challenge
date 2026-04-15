const { override } = require("react-app-rewired");
const webpack = require("webpack");

module.exports = function override(config) {
  // Polyfill Node.js core modules for Stellar SDK compatibility
  config.resolve.fallback = {
    ...config.resolve.fallback,
    buffer: require.resolve("buffer/"),
    stream: require.resolve("stream-browserify"),
    crypto: require.resolve("crypto-browserify"),
    process: require.resolve("process/browser"),
  };

  config.plugins = [
    ...config.plugins,
    new webpack.ProvidePlugin({
      Buffer: ["buffer", "Buffer"],
      process: "process/browser",
    }),
  ];

  // Ignore source-map warnings from stellar-sdk
  config.ignoreWarnings = [/Failed to parse source map/];

  return config;
};
