
/**
 * split path data into chunks 
 * to detect subsequent cubic segments 
 * that could be  combined
 */

import { splitSubpaths, shiftSvgStartingPoint } from "./convert_segments";
import { getAngle, bezierhasExtreme } from "./geometry";
import { renderPoint, renderPath } from "./visualize";


import {optimizeStartingPoints} from './cleanup.js';
import { getPathDataVertices, getPointOnEllipse, getPolyBBox, pointAtT, checkLineIntersection, getDistance, interpolate, getPolygonArea } from './geometry.js';


import { pathDataArcsToCubics, pathDataQuadraticToCubic, quadratic2Cubic, pathDataToRelative, pathDataToAbsolute, pathDataToLonghands, pathDataToShorthands, pathDataToQuadratic, cubicToQuad, arcToBezier, pathDataToVerbose, convertArrayPathData, revertPathDataToArray, } from './convert_pathData.js';

import { simplifyBezierSequence } from './simplify_bezier.js';



export function simplifyPathData(pathData) {

    //console.log('simpl!!!');

    let pathPoly = getPathDataVertices(pathData);
    let bb = getPolyBBox(pathPoly)
    let { width, height } = bb;
    let thresh = (width + height) / 2 * 0.1



    // group pathdata by sequences of same type
    //let pathDataChunks = getPathDataChunks(pathData);
    let subPathChunks = getPathDataChunks(pathData);
    //let tolerance = 0.5;
    let pathDataSimple = [];

    subPathChunks.forEach(pathDataChunks => {

        for (let i = 0, len = pathDataChunks.length; i < len; i++) {
            let chunk = pathDataChunks[i];
            let type = chunk[0].type;

            if (type === 'C' || type === 'Q') {
                if (chunk.length) {
                    let simplified = simplifyBezierSequence(chunk, thresh);
                    pathDataSimple.push(...simplified);
                }
            }

            // No match, keep original commands
            else {
                chunk.forEach(com => pathDataSimple.push({ type: com.type, values: com.values }));
            }
        }
    });


    return pathDataSimple;
}



/**
 * split segments into chunks to
 * prevent simplification across 
 * extremes, corners or direction changes
 */

export function getPathDataChunks(pathData) {

    // get segment properties
    pathData = JSON.parse(JSON.stringify(pathData));

    // optimize starting points
    pathData = optimizeStartingPoints(pathData);

    let pathDatArr = splitSubpaths(pathData)

    // collect chunks for each sub path
    let pathDataChunksSubArr = [];


    pathDatArr.forEach(pathData => {

        //chunks for sub path
        let pathDataChunksSub = []

        let pathPoly = getPathDataVertices(pathData);
        let bb = getPolyBBox(pathPoly)
        console.log(pathPoly, bb);
        let {left, right, top, bottom, width, height } = bb;
    

        let M = { x: pathData[0].values[0], y: pathData[0].values[1] };
        let p0 = { x: pathData[0].values[0], y: pathData[0].values[1] };
        let p;

        pathData[0].p0 = M;
        pathData[0].p = M;
        //renderPoint(svg1, M, 'green', '3%')

        // add first M command
        let pathDataProps = [pathData[0]];
        let lastType = 'M'
        let wasExtreme = false;
        let wasCorner = false;
        let wasDirectionChange = false;

        let indCorner = 0
        let indExtreme = 0;
        let area0 = 0;

        for (let c = 2, len = pathData.length; len && c <= len; c++) {

            let showPts = true

            let com = pathData[c - 1];
            let { type, values } = com;
            let valsL = values.slice(-2);


            // is last Z
            if (c === len && type.toLowerCase() === 'z') {
                //console.log('is Z');
                com.split = true;
                pathDataProps.push(com)
                break
            }

            //let tolerance = Math.PI / 180 * 1.1
            let angleThreshold = 0.05
            p = valsL.length ? { x: valsL[0], y: valsL[1] } : M;


            // update M for Z starting points
            if (type === 'M') {
                M = p;
            }
            else if (type.toLowerCase() === 'z') {
                //p0 = M;
                p = M;
            }

            // init properties
            com.split = false;
            com.extreme = false;
            com.directionChange = false;
            com.corner = false;
            com.p0 = p0;
            com.p = p;

            let cp1, cp2, cp1N, cp2N, pN, typeN, area1, area2;


            // if bezier
            if (type === 'Q' || type === 'C') {
                cp1 = { x: values[0], y: values[1] }
                cp2 = type === 'C' ? { x: values[2], y: values[3] } : null;
                com.cp1 = cp1;
                if (cp2) com.cp2 = cp2;
            }


            //next command
            let comN = pathData[c] ? pathData[c] : null;
            let comNValsL = comN ? comN.values.slice(-2) : null;

            // get bezier control points
            if (comN) {
                typeN = comN.type;
                pN = comN ? { x: comNValsL[0], y: comNValsL[1] } : null;

                if (comN.type === 'Q' || comN.type === 'C') {
                    cp1N = { x: comN.values[0], y: comN.values[1] }
                    cp2N = comN.type === 'C' ? { x: comN.values[2], y: comN.values[3] } : null;
                }
            }


            // new type or previous was corner or extreme
            //wasDirectionChange
            if (type !== lastType || wasCorner || wasExtreme) {
                //console.log('wasDirectionChange', wasDirectionChange);
                com.split = true;
                wasCorner = false;
                wasExtreme = false;
                //wasDirectionChange = false;
            }



            /**
             * get area of adjacent commands
             * to detect direction changes
             */
            let pts = [];

            // first command
            pts.push(p0)
            if (type === 'Q' || type === 'C') {
                pts.push(cp1)
            }
            if (type === 'C') {
                pts.push(cp2)
            }
            pts.push(p)
            area1 = getPolygonArea(pts)


            let isDirectionChange = false

            // we have a direction change
            let signChange = (area0 < 0 && area1 > 0) || (area0 > 0 && area1 < 0) ? true : false;
            //console.log(area0, area1);
            area0 = area1


            if (signChange) {
                isDirectionChange = true;
                renderPoint(svg1, p0, 'orange', '1.5%')
                com.split = true;
                com.directionChange = true;
                wasDirectionChange = true;

            }



            // ??? quit last command ???
            /*
            if (!comN && !wasDirectionChange) {
                //com.split = false;
                //console.log('last non z', com);
                renderPoint(svg1, p, 'pink', '2%')

                pathDataProps.push(com)
                break;
            }
                */


            // is extreme relative to bounding box 
            if( p.x===left || p.y===top  || p.x===right || p.y===bottom   ){
                //renderPoint(svg1, p, 'cyan')
                com.extreme = true;
                //com.split = true;
            }




            if (type === 'Q' || type === 'C') {

                /**
                 * check extremes or corners for adjacent curves by controlpoint angles
                 */
                if ((type === 'Q' && typeN === 'Q') || (type === 'C' && typeN === 'C')) {

                    // type change
                    if (type !== lastType) com.split = true

                    // check extremes
                    let cpts = type === 'C' ? [cp1, cp2, p] : [cp1, p];
                    let hasExtremes = !com.extreme ? bezierhasExtreme(p0, cpts, angleThreshold) : true


                    //&& !wasDirectionChange
                    // skip last curve
                    /*
                    if (c === len - 1) {
                        com.extreme = false
                        wasExtreme = false
                        renderPoint(svg1, p, 'purple', '1%')
                        console.log('is last', com, c, len - 1, pathData);

                    }
                        */

                    if (hasExtremes) {
                        if (showPts) {
                            renderPoint(svg1, p, 'cyan', '1%')
                        }
                        com.extreme = true
                        wasExtreme = true
                        //indExtreme = c;
                    }

                    // check corners
                    else {

                        //let ang3 = getAngle(p, cp1N);
                        let ang3 = getAngle(cp1, p, true);
                        let ang4 = getAngle(p, cp1N, true);
                        let ang5 = cp2 ? getAngle(cp2, p, true) : 0;
                        let ang6 = cp2 ? getAngle(p, cp1N, true) : 0;

                        let diffA1 = Math.abs(ang4 - ang3)
                        let diffA2 = cp2 ? Math.abs(ang6 - ang5) : 0

                        let isCorner = type === 'C' ? cp2 && diffA2 > angleThreshold : diffA1 > 0.1

                        if (isCorner) {
                            if (showPts) {
                                renderPoint(svg1, p, 'magenta', '1%')
                            }
                            com.isCorner = true
                            wasCorner = true

                            //set index for reordering
                            indCorner = !indCorner ? c : indCorner

                        }

                    }
                }
            }

            pathDataProps.push(com)

            // update type
            lastType = type;
            p0 = p;

        }

        /*
        if (indExtreme || indCorner) {
            let newStartindex = indCorner ? indCorner : (indExtreme ? indExtreme : 0)

            console.log('reorder', indExtreme, indCorner, 'newStartindex', newStartindex);

           if(newStartindex) {
            pathDataProps = shiftSvgStartingPoint(pathDataProps, newStartindex)
           }
        }
        */


        console.log('pathDataProps', pathDataProps);

        // group in chunks
        let pathDataChunks = [[pathDataProps[0]], []];
        let ind = 1


        for (let i = 1, len = pathDataProps.length; i < len; i++) {

            let com = pathDataProps[i];
            let { split, extreme, corner, directionChange } = com;
            //|| (directionChange && !extreme)

            /*
            //allow maximum 4 segments in a chunk
            if(pathDataChunks[ind].length>3) {
                split = true;
                pathDataChunks.push([]);
                ind++
            }
            */
            
            if (split) {
                if (pathDataChunks[ind].length) {
                    pathDataChunks.push([]);
                    ind++
                }

                // console.log(pathDataChunks);
            }
            pathDataChunks[ind].push(com)

        }

        pathDataChunksSub.push(...pathDataChunks)

        //add to sub path arr
        pathDataChunksSubArr.push(pathDataChunksSub)


    })

    console.log('pathDataChunksSub', pathDataChunksSubArr);


    /*
    // debug rendering
    let debug = false
    if (debug) {
        pathDataChunks.forEach((ch, i) => {
            let stroke = i % 2 === 0 ? 'green' : 'orange';

            let M = ch[0].p0;
            //renderPoint(svg1, M, 'green', '2%')
            let d = `M ${M.x} ${M.y}`

            ch.forEach(com => {
                //console.log(com);
                d += `${com.type} ${com.values.join(' ')}`
                //let pt = com.p;
                //renderPoint(svg1, pt, 'cyan')
            })
            console.log(d);
            renderPath(svg1, d, stroke, '2%')
        })
    }
    */

    //console.log(pathDataChunks);
    //console.log(pathDataProps);

    return pathDataChunksSubArr

}






