import terser from '@rollup/plugin-terser';

const stripDevComments = () => ({
    name: 'strip-dev-comments',
    renderChunk(code) {
      return code
        /* SAFER LINE-BY-LINE PROCESSING */
        // Remove single-line /* comments */ (but keep /** docs */)
        .replace(/^[ \t]*\/\*(?!\*).*?\*\/[ \t]*$/gm, '')
        
        // Remove //comments without space (but keep // comments)
        .replace(/^[ \t]*\/\/[^\s].*$/gm, '')
        
        /* FORMATTING */
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n');
    }
  });

  
const libName = 'SVGii';
const libName2 = 'SVGiiSimplify';



export default [

    // simplify
    {
        input: 'src/svgii_simplify.js',
        output: [
            {
                file: `dist/${libName2}.js`,
                name: `${libName2}`,
                format: 'iife',
                extend: true,
                exports: 'named',
                plugins: [stripDevComments()]
            },
            {
                file: `dist/${libName2}.min.js`,
                format: 'iife',
                extend: true,
                exports: 'named',
                name: `${libName2}`,
                plugins: [terser()]
            },

        ]
    },



    // core
    {
        input: 'src/index.js',
        output: [
            {
                file: `dist/${libName}.js`,
                format: 'umd',
                name: `${libName}`
            },
            {
                file: `dist/${libName}.min.js`,
                format: 'umd',
                name: `${libName}`,
                plugins: [terser()]
            },

        ]
    },

    //addon visualize
    {
        input: 'src/addon_visualize.js',
        output: [
            {
                file: `dist/${libName}_visualize.js`,
                format: 'umd',
                name: `${libName}`,
                extend: true
            },
            {
                file: `dist/${libName}_visualize.min.js`,
                format: 'umd',
                name: `${libName}`,
                extend: true,
                plugins: [terser()]
            },

        ]
    },



];
