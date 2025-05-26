
/**
 * split path data into chunks 
 * to detect subsequent cubic segments 
 * that could be  combined
 */

//import { splitSubpaths, shiftSvgStartingPoint } from "./convert_segments";
import { shiftSvgStartingPoint, optimizePathDataPlusOrder, getPathDataPlusChunks } from "./pathData_reorder.js";
import { splitSubpaths } from './pathData_split.js';

import { getAngle, bezierhasExtreme, getPathDataVertices } from "./geometry";
import { renderPoint, renderPath } from "./visualize";


//import { optimizeStartingPoints } from './cleanup.js';
//import { getPathDataVertices, getPointOnEllipse, pointAtT, checkLineIntersection, getDistance, interpolate } from './geometry.js';

import {  getPolygonArea, getPathArea } from './geometry_area.js';
import {  getPolyBBox } from './geometry_bbox.js';



import { pathDataCubicToArc, pathDataArcsToCubics, pathDataQuadraticToCubic, quadratic2Cubic, pathDataToRelative, pathDataToAbsolute, pathDataToLonghands, pathDataToShorthands, pathDataToQuadratic, cubicToQuad, arcToBezier, pathDataToVerbose, convertArrayPathData, revertPathDataToArray, } from './pathData_convert.js';


import { simplifyBezierSequence } from './simplify_bezier.js';


import { analyzePathData } from "./pathData_anylyse.js"; 



export function simplifyPathData(pathData) {

    // get verbose pathdata properties
    let pathDataPlus = analyzePathData(pathData);
    console.log('pathDataPlus', pathDataPlus);

    // shift starting points
    let pathDataPlusRearranged = optimizePathDataPlusOrder(pathDataPlus);
    console.log('pathDataPlusRearranged', pathDataPlusRearranged);

    // get chunks
    let pathDataPlusChunks = getPathDataPlusChunks(pathDataPlusRearranged);
    console.log('pathDataPlusChunks!!!', pathDataPlusChunks);

    //console.log('simpl!!!');

    // group pathdata by sequences of same type
    let subPathChunks = getPathDataChunks(pathData);
    //let tolerance = 0.5;
    let pathDataSimple = [];

    //original pathArea 
    let pathArea = getPathArea(pathData)


    subPathChunks.forEach(pathDataChunks => {

        //let pathDataCh = pathDataChunks.map(ch=>{return ch}).flat()
        let pathDataSub = pathDataChunks.flat();
        let pathPoly = getPathDataVertices(pathDataSub);
        let bb = getPolyBBox(pathPoly)
        let { width, height } = bb;
        // threshold relative to sub path size
        let thresh = (width + height) / 2 * 0.1
    
        //console.log('pathDataCh', pathDataSub);

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

    //try cubic to arc conversion

    //pathDataSimple = pathDataCubicToArc(pathDataSimple)

    let pathAreaSimple = getPathArea(pathDataSimple)
    let diff = Math.abs(pathArea - pathAreaSimple);
    let rat = pathArea/pathAreaSimple;
    // deviation in percent
    let deviation = Math.abs(100- (100/pathArea * (pathArea+diff)))
    console.log('pathAreaSimple', pathAreaSimple, pathArea, 'rat', rat, 'deviation', deviation);

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
    //pathData = optimizeStartingPoints(pathData);

    let pathDatArr = splitSubpaths(pathData)

    // collect chunks for each sub path
    let pathDataChunksSubArr = [];


    pathDatArr.forEach(pathData => {

        //chunks for sub path
        let pathDataChunksSub = []

        let pathPoly = getPathDataVertices(pathData);
        let bb = getPolyBBox(pathPoly)
        let { left, right, top, bottom, width, height } = bb;


        let M = { x: pathData[0].values[0], y: pathData[0].values[1] };
        let p0 = { x: pathData[0].values[0], y: pathData[0].values[1] };
        let p;

        pathData[0].p0 = M;
        pathData[0].p = M;

        // add first M command
        let pathDataProps = [pathData[0]];
        let area0 = 0;

        for (let c = 2, len = pathData.length; len && c <= len; c++) {


            let com = pathData[c - 1];
            let { type, values } = com;
            let valsL = values.slice(-2);


            // is last Z

            if (c === len && type.toLowerCase() === 'z') {
                //console.log('is Z');
                com.closePath = true;
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


            // add on-path points
            com.p0 = p0;
            com.p = p;

            let cp1, cp2, cp1N, cp2N, pN, typeN, area1;


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
            typeN = comN ? comN.type : null;


            // get bezier control points
            if (comN) {
                pN = comN ? { x: comNValsL[0], y: comNValsL[1] } : null;

                if (comN.type === 'Q' || comN.type === 'C') {
                    cp1N = { x: comN.values[0], y: comN.values[1] }
                    cp2N = comN.type === 'C' ? { x: comN.values[2], y: comN.values[3] } : null;
                }
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
            // get command area
            area1 = getPolygonArea(pts)


            // we have a direction change
            let signChange = (area0 < 0 && area1 > 0) || (area0 > 0 && area1 < 0) ? true : false;
            // update area
            area0 = area1

            if (signChange) {
                //renderPoint(svg1, p0, 'orange', '2.5%', '0.75')
                com.directionChange = true;
            }


            // is extreme relative to bounding box 
            if (p.x === left || p.y === top || p.x === right || p.y === bottom) {
                com.extreme = true;
                //renderPoint(svg1, p, 'cyan', '1%')
            }


            /**
             * check extremes or corners for adjacent curves by control point angles
             */
            if (type === 'Q' || type === 'C') {

                if ((type === 'Q' && typeN === 'Q') || (type === 'C' && typeN === 'C')) {

                    // check extremes
                    let cpts = type === 'C' ? [cp1, cp2, p] : [cp1, p];
                    let hasExtremes = !com.extreme ? bezierhasExtreme(p0, cpts, angleThreshold) : true

                    if (hasExtremes) {
                        //renderPoint(svg1, p, 'cyan', '1%')
                        com.extreme = true
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
                            //renderPoint(svg1, p, 'magenta', '1.5%')
                            com.corner = true;
                        }

                    }
                }
            }

            pathDataProps.push(com)
            p0 = p;

        }


        //console.log('pathDataProps', pathDataProps);



        /**
         * reorder to set extreme or corner as first command
         */



        // reorder

        let newStartindex = -1;
        let isClosed = pathDataProps[pathDataProps.length-1].type.toLowerCase()==='z'
        if(isClosed){
            for (let i = 0, len = pathDataProps.length; i < len && newStartindex < 0; i++) {
    
                let com = pathDataProps[i];
                let { extreme = false, corner = false, directionChange = false } = com;
                //console.log(extreme, corner, directionChange);
                if (extreme || corner || directionChange) {
                    //console.log('new index', i);
                    newStartindex = i
                }
            }
    
            if (newStartindex > 0) {
                pathDataProps = shiftSvgStartingPoint(pathDataProps, newStartindex)
                // update on-path point data
                //console.log('shift', pathDataProps);
                pathDataProps[0].p0 = { x: pathDataProps[0].values[0], y: pathDataProps[0].values[1] }
                pathDataProps[0].p = pathDataProps[0].p0
                pathDataProps[1].p0 = pathDataProps[0].p0
            }

        }



        // group in chunks
        let pathDataChunks = [[pathDataProps[0]], []];
        let ind = 1


        let wasExtreme = false
        let wasCorner = false
        let wasClosePath = false;
        let prevType = 'M';
        let typeChange = false;

        for (let i = 1, len = pathDataProps.length; i < len; i++) {

            let com = pathDataProps[i];
            let { extreme, corner, directionChange } = com;
            typeChange = prevType!==com.type;
            let split = directionChange || wasExtreme || wasCorner || wasClosePath || typeChange;


            //console.log('wasExtreme', wasExtreme, extreme);
            // new chunk
            if (split) {
                //renderPoint(svg1, com.p0, 'purple', '1%');
                if (pathDataChunks[ind].length) {
                    pathDataChunks.push([]);
                    ind++
                }
            }

            wasExtreme = extreme
            wasCorner = corner;
            wasClosePath = com.type.toLowerCase() === 'z'
            prevType = com.type

            pathDataChunks[ind].push(com)

        }

        pathDataChunksSub.push(...pathDataChunks)


        // debug rendering
        let debug = false
        if (debug) {
            pathDataChunksSub.forEach((ch, i) => {
                let stroke = i % 2 === 0 ? 'green' : 'orange';

                let M = ch[0].p0;
                if (M) {
                    renderPoint(svg1, M, 'green', '3%')

                    let d = `M ${M.x} ${M.y}`

                    ch.forEach(com => {
                        //console.log(com);
                        d += `${com.type} ${com.values.join(' ')}`
                        //let pt = com.p;
                        //renderPoint(svg1, pt, 'cyan')
                    })
                    //console.log(d);
                    renderPath(svg1, d, stroke, '1%', '0.5')
                }

            })
        }




        //add to sub path arr
        pathDataChunksSubArr.push(pathDataChunksSub)


    })

    console.log('pathDataChunksSub', pathDataChunksSubArr);





    //console.log(pathDataChunks);
    //console.log(pathDataProps);

    return pathDataChunksSubArr

}






