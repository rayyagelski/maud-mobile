module.exports = {
  preset: '@react-native/jest-preset',
  // The preset only transforms react-native packages. @reduxjs/toolkit,
  // immer and react-redux ship ESM that Jest can't parse untransformed
  // ("Unexpected token 'export'"), which made anything importing a Redux
  // slice untestable (App.test.tsx has failed on exactly this since the
  // start). Extend the allowlist to cover them.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@reduxjs/toolkit|immer|react-redux|redux)/)',
  ],
};
