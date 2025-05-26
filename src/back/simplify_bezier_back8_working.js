import { pathDataArcsToCubics, pathDataQuadraticToCubic, quadratic2Cubic, pathDataToRelative, pathDataToAbsolute, pathDataToLonghands, pathDataToShorthands, pathDataToQuadratic, cubicToQuad, arcToBezier, pathDataToVerbose, convertArrayPathData, revertPathDataToArray, } from './pathData_convert.js';


import { getAngle, bezierhasExtreme, getDistance, getSquareDistance, pointAtT, checkLineIntersection, interpolate, getPointOnEllipse, commandIsFlat } from "./geometry";

import { getPathArea, getRelativeAreaDiff } from "./geometry_area.js";

import { renderPoint } from './visualize.js';




/**
 * Function to simplify cubic Bézier sequences
 * thresh defines a threshold based on the 
 * segment size
 * tolerance describes a percentage based deviation 
 * comparing unoptimized against combined segment areas
 */
export function simplifyBezierSequence(chunk, thresh, tolerance = 5) {

    // t value for control point extrapolation
    const t = 1.333;

    // collect simplified path data commands
    let simplified = [];
    let Clen = chunk.length;
    let { type, p0, cp1, p, values } = chunk[0];

    // get original chunk area for error detection
    let pathDataChunk = [{ type: 'M', values: [p0.x, p0.y] }, ...chunk];

    // unoptimized area
    let area0 = getPathArea(pathDataChunk);

    //console.log('chunk', p0, chunk[0]);
    let cp2 = type === 'C' ? chunk[0].cp2 : null
    let p0_1, cp1_1, cp2_1, p_1, cp1_2, cp2_2, p_2, comSimple, areaSimple, areaDiff, cp1_cubic, cp2_cubic;

    let indexEnd = chunk.length - 1;
    let indexMid = Math.floor(chunk.length / 2)


    if (Clen > 1) {
        p0_1 = chunk[1].p0;
        cp1_1 = chunk[1].cp1;
        cp2_1 = type === 'C' ? chunk[1].cp2 : null;
        p_1 = chunk[1].p;


        //get end points
        p_2 = chunk[indexEnd].p;
        cp1_2 = chunk[indexEnd].cp1;
        cp2_2 = type === 'C' ? chunk[indexEnd].cp2 : chunk[indexEnd].cp1;

    }

    if (Clen > 2) {
        //last control point
        cp2_2 = type === 'C' ? chunk[2].cp2 : chunk[2].cp1;
        p_2 = chunk[2].p;

        //get mid command
        //p_2 = chunk[indexMid].p;
        //cp2_2 = type === 'C' ? chunk[indexMid].cp2 : chunk[indexMid].cp1;

        //get end points
        p_2 = chunk[indexEnd].p;
        cp2_2 = type === 'C' ? chunk[indexEnd].cp2 : chunk[indexEnd].cp1;
        //console.log('cp2_2', cp2_2);

    }


    // 3 or more subsequent bezier segments
    if (Clen > 2) {

        let controlPoints = type === 'C' ? [p0_1, cp1_1, cp2_1, p_1] : [p0_1, cp1_1, p_1];

        // interpolate mid point in mid segment and get cpts
        let ptMid = pointAtT(controlPoints, 0.5, true, true);

        cp1_cubic = checkLineIntersection(ptMid, ptMid.cpts[0], cp1, p0, false);
        cp2_cubic = checkLineIntersection(ptMid, ptMid.cpts[0], cp2_2, p_2, false);

        // extrapolate control points
        cp1_cubic = pointAtT([p0, cp1_cubic], t);
        cp2_cubic = pointAtT([p_2, cp2_cubic], t);


    }

    // combine 2 cubic segments
    else if (Clen === 2) {

        // convert quadratic to cubic
        if (type === 'Q') {
            let c1 = quadratic2Cubic(p0, values);
            cp1_1 = { x: c1.values[0], y: c1.values[1] };
            cp2_1 = { x: c1.values[2], y: c1.values[3] };

            let c2 = quadratic2Cubic(p, chunk[1].values);
            cp2_2 = { x: c2.values[2], y: c2.values[3] };

        } else {
            cp1_1 = cp1;
            cp2_1 = cp2;
            cp2_2 = chunk[1].cp2;
        }


        /**
         * Approach 1:
         * get combined control points
         * by extrapolating mid tangent intersection
         */

        // Get cp intersection point
        let cpI = checkLineIntersection(p0, cp1, cp2_2, p_2, false);
        let cp1_cubicInter = checkLineIntersection(p, cp2_1, p0, cpI, false);
        let cp2_cubicInter = checkLineIntersection(p, cp1_2, p_2, cpI, false);

        // extrapolate control points
        cp1_cubic = pointAtT([p0, cp1_cubicInter], t);
        cp2_cubic = pointAtT([p_2, cp2_cubicInter], t);

        // check area
        comSimple = [
            { type: 'M', values: [p0.x, p0.y] },
            { type: 'C', values: [cp1_cubic.x, cp1_cubic.y, cp2_cubic.x, cp2_cubic.y, p_1.x, p_1.y] }
        ];
        areaSimple = getPathArea(comSimple);

        //let diff = Math.abs(area0 - areaSimple);
        areaDiff = getRelativeAreaDiff(area0, areaSimple)


        /**
         * If Approach 1 is to imprecise:
         * Approach 2:
         * add segments' cp tangents lengths for
         * combined control points
         */

        if (areaDiff > tolerance) {

            // 1  distances between "tangent handles"
            let t0Length = getDistance(p0, cp1_1);
            let t1Length = getDistance(p_1, cp2_2);

            // new average tangent length
            let t2Length = t0Length + t1Length;
            let tRat0 = t2Length / t0Length;
            let tRat1 = t2Length / t1Length;

            // extrapolate cp tangents
            cp1_cubic = pointAtT([p0, cp1_1], tRat0);
            cp2_cubic = pointAtT([p_1, cp2_2], tRat1);

        }

    }

    /**
     * ultimate area check
     * if deviation is to large 
     * return original commands
     */

    comSimple = [
        { type: 'M', values: [p0.x, p0.y] },
        { type: 'C', values: [cp1_cubic.x, cp1_cubic.y, cp2_cubic.x, cp2_cubic.y, p_2.x, p_2.y] }
    ];
    areaSimple = getPathArea(comSimple);

    //let diff = Math.abs(area0 - areaSimple);
    areaDiff = getRelativeAreaDiff(area0, areaSimple)


    // !!! CAN be simplified
    if (areaDiff < tolerance) {
        simplified.push({ type: 'C', values: [cp1_cubic.x, cp1_cubic.y, cp2_cubic.x, cp2_cubic.y, p_2.x, p_2.y] });
    } 
    // !!! no way to simplify
    else {
        simplified = [...chunk];
        //console.log('areaDiff', areaDiff, tolerance, p_2.x, p_2.y);
    }

    return simplified;
}


