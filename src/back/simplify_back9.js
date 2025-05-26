
/**
 * split path data into chunks 
 * to detect subsequent cubic segments 
 * that could be  combined
 */

//import { splitSubpaths, shiftSvgStartingPoint } from "./convert_segments";
import { shiftSvgStartingPoint, getPathDataPlusChunks } from "./pathData_reorder.js";
import { splitSubpaths } from './pathData_split.js';

import { getAngle, bezierhasExtreme, getPathDataVertices } from "./geometry";
import { renderPoint, renderPath } from "./visualize";


//import { optimizeStartingPoints } from './cleanup.js';
//import { getPathDataVertices, getPointOnEllipse, pointAtT, checkLineIntersection, getDistance, interpolate } from './geometry.js';

import { getPolygonArea, getPathArea, getRelativeAreaDiff } from './geometry_area.js';
import { getPolyBBox } from './geometry_bbox.js';

import { optimizeStartingPoints, cleanUpPathData } from './cleanup.js';

import { pathDataArcsToCubics, pathDataQuadraticToCubic, quadratic2Cubic, pathDataToRelative, pathDataToAbsolute, pathDataToLonghands, pathDataToShorthands, pathDataToQuadratic, cubicToQuad, arcToBezier, pathDataToVerbose, convertArrayPathData, revertPathDataToArray, combineArcs, replaceCubicsByArcs } from './pathData_convert.js';


import { simplifyBezierSequence } from './simplify_bezier.js';
//import { simplifyBezierSequence } from './simplify_bezier_back8_working.js';
//import { simplifyBezierSequence } from './simplify_bezier_back14.js';



import { simplifyLinetoSequence } from './simplify_linetos.js';



import { analyzePathData } from "./pathData_anylyse.js";



export function simplifyPathData(pathData, tolerance = 7.5, keepDetails = true, multipass = true) {

    //console.log('simplifyPathData');

    // remove zero length commands and shift starting point
    let addExtremes = true;
    //addExtremes = false;

    let removeFinalLineto = false
    let startToTop = true;
    let debug = false
    //tolerance = 5;

    // show chunks
    //debug = true

    //keepDetails=false;

    /**
     * optimize starting point
     * remove zero length segments
     */
    pathData = cleanUpPathData(pathData, addExtremes, removeFinalLineto, startToTop, debug)


    //original pathArea 
    //let pathArea = getPathArea(pathData)

    // get verbose pathdata properties
    let pathDataPlus = analyzePathData(pathData);
    //console.log('pathDataPlus', pathDataPlus);


    // add chunks to path object
    let pathDataPlusChunks = getPathDataPlusChunks(pathDataPlus, debug);
    //console.log('pathDataPlusChunks!!!', pathDataPlusChunks);

    // create simplified pathData
    let pathDataSimple = [];
    let hasCubics = false;

    // loop sup path
    for (let s = 0, l = pathDataPlusChunks.length; l && s < l; s++) {
        let sub = pathDataPlusChunks[s];
        let { chunks, dimA, area } = sub;


        let thresh = dimA * 0.1
        let len = chunks.length;
        let simplified;
        //console.log('sub', chunks);

        for (let i = 0; i < len; i++) {
            let chunk = chunks[i];
            let type = chunk[0].type;


            // nothing to combine
            if (chunk.length < 2) {
                pathDataSimple.push(...chunk);
                //console.log('simple',chunk );
                continue;
            }


            // simplify linetos
            if (type === 'L' && chunk.length > 1) {
                simplified = simplifyLinetoSequence(chunk, thresh);
                pathDataSimple.push(...simplified);
                //pathDataSimple.push(...chunk);
            }

            // Béziers
            else if (chunk.length > 1 && (type === 'C' || type === 'Q')) {
                //console.log('hasCubics');
                if (chunk.length) {

                    multipass = false

                    let directionChange = chunk[0].directionChange;

                    /**
                     * prevent too aggressive simplification 
                     * e.g for quadratic glyphs
                     * by splitting large chunks in two
                     */
                    if (directionChange && chunk.length > 3 && !multipass) {
                        let split = Math.ceil((chunk.length - 1) / 2)
                        let chunk1 = chunk.slice(0, split)
                        let chunk2 = chunk.slice(split)

                        let simplified1 = simplifyBezierSequence(chunk1, thresh, tolerance, keepDetails);
                        let simplified2 = simplifyBezierSequence(chunk2, thresh, tolerance, keepDetails);

                        pathDataSimple.push(...simplified1, ...simplified2);

                    }

                    else if (multipass) {

                        let p0 = chunk[0].p0
                        let chunk_hi = JSON.parse(JSON.stringify(chunk));

                        // get original chunk area for error detection
                        let pathDataChunk = [{ type: 'M', values: [p0.x, p0.y] }, ...chunk_hi];

                        // unoptimized area
                        let area_original = getPathArea(pathDataChunk);
                        let area_low, area_hi, simplified_low, simplified_hi, pathDataChunk_hi, pathDataChunk_low, areaDiff_hi, areaDiff_low;

                        // low quality
                        let chunk_low = JSON.parse(JSON.stringify(chunk));
                        keepDetails = false;
                        simplified_low = simplifyBezierSequence(chunk_low, thresh, tolerance, keepDetails);
                        pathDataChunk_low = [{ type: 'M', values: [p0.x, p0.y] }, ...simplified_low];
                        area_low = getPathArea(pathDataChunk_low);
                        areaDiff_low = getRelativeAreaDiff(area_original, area_low)
                        //console.log('area_low', area_low, areaDiff_low, area_low);

                        // set to low result

                        // high quality
                        keepDetails = true;

                        // complex bezier sequences are more error prone
                        if (chunk_hi.length > 3) {
                            let split = Math.ceil((chunk_hi.length - 1) / 2)
                            let chunk1 = chunk_hi.slice(0, split)
                            let chunk2 = chunk_hi.slice(split)

                            let simplified_hi1 = simplifyBezierSequence(chunk1, thresh, tolerance, keepDetails);
                            let simplified_hi2 = simplifyBezierSequence(chunk2, thresh, tolerance, keepDetails);

                            // combine
                            simplified_hi = [...simplified_hi1, ...simplified_hi2];
                            pathDataChunk_hi = [{ type: 'M', values: [p0.x, p0.y] }, ...simplified_hi];
                            area_hi = getPathArea(pathDataChunk_hi);
                            //pathDataSimple.push(...simplified1, ...simplified2);

                        } else {
                            simplified_hi = simplifyBezierSequence(chunk_hi, thresh, tolerance, keepDetails);
                            pathDataChunk_hi = [{ type: 'M', values: [p0.x, p0.y] }, ...simplified_hi];
                            area_hi = getPathArea(pathDataChunk_hi);
                        }

                        simplified = simplified_hi
                        areaDiff_hi = getRelativeAreaDiff(area_original, area_hi)
                        //let comDiff = Math.abs(pathDataChunk_hi.length - pathDataChunk_low.length);
                        //console.log('area_hi_detail', area_hi, areaDiff_hi);

                        // low is accurate enough
                        /*
                        if (areaDiff_low < tolerance*0.3 && !chunk[0].directionChange && chunk.length<=4) {
                            simplified = simplified_low
                        } 
                        */
                         if (areaDiff_low < tolerance*0.1 && !chunk[0].directionChange ) {
                            simplified = simplified_low
                        } 


                        pathDataSimple.push(...simplified);
                    }

                    else {
                        simplified = simplifyBezierSequence(chunk, thresh, tolerance, keepDetails);
                        pathDataSimple.push(...simplified);
                    }
                }
                if (type === 'C') hasCubics = true
            }

            // No match, keep original commands
            else {
                //chunk.forEach(com => pathDataSimple.push({ type: com.type, values: com.values }));
                pathDataSimple.push(...chunk);
            }
        }
    }


    //console.log('pathDataSimple', pathDataSimple);


    // let comNew = [M, com1, com2];
    // let d = comNew.map(com => { return `${com.type} ${com.values.join(' ')}` }).join(' ')

    /**
     * try to replace cubics 
     * to arcs
     */

    pathDataSimple = replaceCubicsByArcs(pathDataSimple);

    // combine adjacent arcs
    pathDataSimple = combineArcs(pathDataSimple);


    /**
     * optimize start points
     * we done it before 
     * but we need to apply this again to 
     * avoid unnecessary close linetos
     */

    removeFinalLineto = true;
    startToTop = false;
    addExtremes = false;
    debug = false;
    //pathDataSimple = cleanUpPathData(pathDataSimple, addExtremes, removeFinalLineto, startToTop, debug)

    console.log('pathDataSimple post', pathDataSimple);

    return pathDataSimple;
}
















