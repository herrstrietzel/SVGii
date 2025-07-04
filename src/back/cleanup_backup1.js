//import { quadratic2Cubic } from './convert.js';
//import { splitSubpaths, shiftSvgStartingPoint } from './convert_segments.js';
import { shiftSvgStartingPoint } from './pathData_reorder.js';
import { splitSubpaths } from './pathData_split.js';
import { getComThresh, commandIsFlat, getPathDataVertices } from './geometry.js';

import { getPolyBBox } from './geometry_bbox.js';




/**
 * remove zero length commands
 * replace flat beziers with lintos
 * replace closing lines with z
 * rearrange commands to avoid unnessessary linetos
 */


export function cleanUpPathData(pathData, addExtremes = false, svg = null, debug = false) {

    //collect logs
    let simplyfy_debug_log = [];


    pathData = JSON.parse(JSON.stringify(pathData));
    let pathDataNew = [pathData[0]];


    /**
     * get poly bbox to define
     * an appropriate relative threshold
     * for flat or short segment detection
     */
    let pathPoly = getPathDataVertices(pathData);
    let bb = getPolyBBox(pathPoly)
    let { width, height } = bb;
    let tolerance = (width + height) / 2 * 0.001


    // previous on path point
    let p0 = { x: pathData[0].values[0], y: pathData[0].values[1] };
    let M = { x: pathData[0].values[0], y: pathData[0].values[1] };


    for (let c = 1, len = pathData.length; len && c < len; c++) {
        let com = pathData[c];
        let comPrev = pathData[c - 1];
        let comN = pathData[c + 1] ? pathData[c + 1] : '';
        let { type, values } = com;
        let typeRel = type.toLowerCase();
        let valsL = values.slice(-2);
        let p = { x: valsL[0], y: valsL[1] };

        // segment command points - including previous final on-path
        let pts = [p0, p]
        if (type === 'C' || type === 'Q') pts.push({ x: values[0], y: values[1] })
        if (type === 'C') pts.push({ x: values[2], y: values[3] })


        // get relative threshold based on averaged command dimensions
        let xArr = pts.map(pt => { return pt.x });
        let yArr = pts.map(pt => { return pt.y });
        let xMax = Math.max(...xArr)
        let xMin = Math.min(...xArr)
        let yMax = Math.max(...yArr)
        let yMin = Math.min(...yArr)

        let w = xMax - xMin
        let h = yMax - yMin
        let dimA = (w + h) / 2 || 0;

        if (type.toLowerCase() !== 'z') {

            // zero length
            //|| (type==='L' && dimA<tolerance)
            if ((p.x === p0.x && p.y === p0.y) || (type === 'L' && dimA < tolerance)) {
                //console.log('zero', com, dimA, tolerance, w, h);
                if (debug) simplyfy_debug_log.push(`removed zero length ${type}`)
                continue
            }

            /**
             * simplify adjacent linetos
             * based on their flatness
             */
            else if (type === 'L') {

                //unnessecary closing linto
                if (p.x === M.x && p.y === M.y && comN.type.toLowerCase() === 'z') {
                    if (debug) simplyfy_debug_log.push(`unnessecary closing linto`)
                    continue
                }


                if (comN.type === 'L') {

                    let valuesNL = comN.values.slice(-2)
                    let pN = { x: valuesNL[0], y: valuesNL[1] }


                    // check if adjacent linetos are flat
                    let flatness = commandIsFlat([p0, p, pN], tolerance)
                    let isFlatN = flatness.flat;


                    // next lineto is flat – don't add command
                    if (isFlatN) {
                        //console.log('flat');
                        if (debug) simplyfy_debug_log.push(`remove flat linetos`)
                        continue
                    }
                }
            }


            if (type === 'C') {
                /**
                 * detect flat beziers
                 * often used for morphing 
                 * animation
                 */

                let cp1 = { x: values[0], y: values[1] }
                let cp2 = { x: values[2], y: values[3] }
                let pts = [p0, cp1, cp2, p];

                let flatness = commandIsFlat(pts, tolerance)
                let isFlat = flatness.flat
                let ratio = flatness.ratio;
                //console.log('flatness', flatness);

                let valuesNL = comN ? comN.values.slice(-2) : '';
                let pN = valuesNL.length ? { x: valuesNL[0], y: valuesNL[1] } : ''


                //check adjacent flat C - convert to linetos
                if (isFlat) {

                    if (comN.type === 'C') {

                        // check if adjacent curves are also flat
                        let flatnessN = commandIsFlat([p0, p, pN], tolerance)
                        let isFlatN = flatnessN.flat;

                        if (isFlatN) {
                            //console.log(flatnessN);
                            if (debug) simplyfy_debug_log.push(`skip cubic - actually a lineto:  area-ratio: ${ratio}, flatness next:${flatnessN}`)
                            continue
                        }
                    }

                    if (ratio < 0.02) {
                        simplyfy_debug_log.push(`simplify cubic to lineto`)
                        com = { type: 'L', values: [p.x, p.y] };
                    }

                }
                // not flat
                else {

                    // add extremes
                    if (addExtremes) {
                        addedExtremes = addExtemesToCommand(p0, values);
                        //console.log(addedExtremes);
                        com = addedExtremes.pathData
                    }

                    //add extremes
                    if (addExtremes && addedExtremes.count) simplyfy_debug_log.push(`added extremes: ${addedExtremes.count}`)
                }
            }

        }

        // add new commands
        if (com.length) {
            pathDataNew.push(...com);
        } else {
            pathDataNew.push(com);
        }


        if (type.toLowerCase() === "z") {
            p0 = M;
        } else if (type === "M") {
            M = { x: valsL[0], y: valsL[1] };
        }

        // new previous point
        p0 = { x: valsL[0], y: valsL[1] };



    }//end for

    //optimize starting point
    pathDataNew = optimizeStartingPoints(pathDataNew);

    simplyfy_debug_log.push(`original command count: ${pathData.length}; removed:${pathData.length - pathDataNew.length} `)

    if (debug) console.log(simplyfy_debug_log);

    //console.log(pathData.length, pathDataNew.length)
    return pathDataNew;
}


/**
 * avoids starting points in the middle of 2 smooth curves
 * can replace linetos with closepaths
 */

export function optimizeStartingPoints(pathData, removeFinalLineto = false) {

    //console.log('start');

    let pathDataArr = splitSubpaths(pathData);
    //console.log(pathDataArr);

    let pathDataNew = [];
    let len = pathDataArr.length;

    for (let i = 0; i < len; i++) {
        let pathData = pathDataArr[i]

        // move starting point to first lineto
        /*
        let firstLIndex = pathData.reduce((acc, item, index) => {
            if (item.type === 'L') acc.push(index);
            return acc;
        }, [])[0] || -1;
        */
        let firstLIndex = pathData.findIndex(cmd => cmd.type === 'L');
        let firstBezierIndex = pathData.findIndex(cmd => cmd.type === 'C' || cmd.type === 'Q');
        let commands = new Set([...pathData.map(com => com.type)]);
        let hasLinetos = commands.has('L')
        let hasBeziers = commands.has('C') || commands.has('Q')


        let len = pathData.length
        let isClosed = pathData[len - 1].type.toLowerCase() === 'z'
        let M = { x: pathData[0].values[0], y: pathData[0].values[1] }

        if (isClosed) {

            // last already implicit closing line to
            let penultimateCom = pathData[len - 2];
            let penultimateType = penultimateCom.type;
            let penultimateComCoords = penultimateCom.values.slice(-2)

            // fist segment
            let secondCommand = pathData[1].type;
            let isClosingCommand = penultimateType === 'L' && penultimateComCoords[0] === M.x && penultimateComCoords[1] === M.y

            let extremeIndex = -1;
            let newIndex = 0


            // get extreme 
            if (hasBeziers) {
                //find extreme
                let pathPoly = getPathDataVertices(pathData);
                let bb = getPolyBBox(pathPoly)
                let { left, right, top, bottom, width, height } = bb;

                for (let i = 0, len = pathData.length; i < len; i++) {
                    let com = pathData[i];
                    let { type, values } = com;
                    if (type === 'C' || type === 'Q') {

                        let valsL = values.slice(-2)
                        let p = { x: valsL[0], y: valsL[1] }
                        // is extreme relative to bounding box 
                        if (p.x === left || p.y === top || p.x === right || p.y === bottom) {
                            extremeIndex = i;
                            break
                        }
                    }
                }

            }

            // set to first extreme or first bezier or first L
            firstBezierIndex = extremeIndex > -1 ? extremeIndex : firstBezierIndex
            newIndex = hasLinetos ? firstLIndex : firstBezierIndex;


            // already ideal
            //(!hasLinetos && !isClosingCommand)
            /*
            if ((hasLinetos && secondCommand !== 'L')) {
                console.log('starting point is already ideal!', isClosingCommand, penultimateCom);
                pathDataNew.push(...pathData);
                continue
            }
            */


            // excplicit close path lineto - to first bezier
            if (hasLinetos && secondCommand === 'L' && hasBeziers) {
                console.log('starting point not ideal - to first bezier', isClosingCommand);

                pathData = shiftSvgStartingPoint(pathData, newIndex)
                pathDataNew.push(...pathData);
                continue

            }


            // between beziers
            if (secondCommand !== 'L' && penultimateType != 'L') {
                console.log('between beziers', hasLinetos, secondCommand, secondCommand);

                pathData = shiftSvgStartingPoint(pathData, newIndex)

                // remove last lineto
                if (isClosingCommand) {
                    pathData.splice(len - 2, 1)
                }

                pathDataNew.push(...pathData);
                continue

            }


        }

        // pass through
        pathDataNew.push(...pathData);

    }
    return pathDataNew
}



