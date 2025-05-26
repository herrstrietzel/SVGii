### rollup-plugin-concat
A Rollup plugin which concatenates files together for further use by the rollup bundling process.

### Install

Using npm:

```npm install rollup-plugin-concat --save-dev```

### Usage

Create a rollup.config.js configuration file and import the plugin:

```
import concat from 'rollup-plugin-concat';

export default {
    input: 'src/index.js',
    output: {
        file: 'bundle.js',
        format: 'esm'
    },
    plugins: [
        concat({
            groupedFiles: [
                {
                    files: ['./fileA.js', './fileB.js'],
                    outputFile: './ab.js',
                },
                {
                    files: ['./fileC.js', './fileD.js'],
                    outputFile: './cd.js',
                },
            ],
        }),
    ],
    //other plugins go here
}
```
Then call rollup either via the CLI or the API.


The configuration above will concatenate the files and output them to a specified output file.  
As the plugin runs on the *buildStart* hook, the outputted file will then be available by other plugins to be imported.  

Typically, rollup-plugin-concat should be placed before other plugins so that they may import the concatenated files if needed.


### Options


#### groupedFiles

Type: Array[{ files : String, outputFile : String}]

Describes a collection of file concatenation groups. Each group should consist of an object that includes a "files" property, indicating the files to be concatenated, and an "outputFile" property indicating the resulting file after concatenation.