const { withNx } = require('@nx/rollup/with-nx');

module.exports = withNx(
  {
    main: './src/index.ts',
    outputPath: './dist',
    tsConfig: './tsconfig.lib.json',
    compiler: 'babel',
    format: ['esm', 'cjs'],
  },
  {
    // Ensure React and React Native are treated as external dependencies
    external: (id) => {
      // Mark React and React Native modules as external
      if (id === 'react' || id === 'react-native' || id === 'react/jsx-runtime') {
        return true;
      }
      // Mark any imports from react as external (like react/jsx-runtime, etc.)
      if (id.startsWith('react/') || id.startsWith('react-native/')) {
        return true;
      }
      return false;
    },
    output: {
      // Ensure React imports are properly mapped
      globals: {
        'react': 'React',
        'react-native': 'ReactNative',
        'react/jsx-runtime': 'ReactJSXRuntime'
      }
    }
  }
);
