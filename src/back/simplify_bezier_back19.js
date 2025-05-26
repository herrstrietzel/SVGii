import { pathDataArcsToCubics, pathDataQuadraticToCubic, quadratic2Cubic, pathDataToRelative, pathDataToAbsolute, pathDataToLonghands, pathDataToShorthands, pathDataToQuadratic, cubicToQuad, arcToBezier, pathDataToVerbose, convertArrayPathData, revertPathDataToArray, cubicToArc } from './pathData_convert.js';


import { getAngle, bezierhasExtreme, getDistance, getSquareDistance, pointAtT, checkLineIntersection, interpolate, getPointOnEllipse, commandIsFlat, getPathDataVertices } from "./geometry";

import { getPathArea, getPolygonArea, getRelativeAreaDiff, getBezierAreaAccuracy } from "./geometry_area.js";

import { renderPoint } from './visualize.js';



/**
 * Function to simplify cubic Bézier sequences
 * thresh defines a threshold based on the 
 * segment size
 * tolerance describes a percentage based deviation 
 * comparing unoptimized against combined segment areas
 */
export function simplifyBezierSequence(chunk, tolerance = 7.5, keepDetails = true, forceCubic = false) {

    //tolerance = 20

    // t value for control point extrapolation
    const t = 1.333;

    // collect simplified path data commands
    let simplified = [];
    let Clen = chunk.length;
    let { type, p0, cp1, cp2 = null, p, values } = chunk[0];

    // get original chunk area for error detection
    let pathDataChunk = [{ type: 'M', values: [p0.x, p0.y] }, ...chunk];

    // unoptimized area
    let area0 = getPathArea(pathDataChunk);

    let p0_1, cp1_1, cp2_1, p_1;
    let cp1_2, cp2_2, p_2;
    let areaDiff, cp1_cubic, cp2_cubic;

    let indexEnd = chunk.length - 1;
    let indexMid = chunk.length > 2 ? Math.floor(chunk.length / 2) - 1 : 1

    // compare accuracy
    let accurate = false;
    let areaDiff1 = 10000
    let areaDiff2 = 10000
    let comAreaDiff1, comAreaDiff2;
    let ptMid, cp1_cubic_1, cp2_cubic_1, cp1_cubic_2, cp2_cubic_2;
    let areaCptPoly

    let log = []
    let c_3_1 = 0, c_3_2 = 0, c_2_1 = 0, c_2_2 = 0;


    /**
     * try to replace single cubics 
     * with quadratic commands
     */
    
    forceCubic= true;

    if (!forceCubic && Clen === 1 && type === 'C') {

        //check flatness
        let flatness = commandIsFlat([p0, cp1, p])
        areaCptPoly = flatness.area

        if (flatness.flat) {
            //console.log('is flat cubic');
            simplified = { type: 'L', values: [p.x, p.y] };
            log.push('cubic to quadratic')
            return simplified
        }


        // quadratic controlpoint
        let cpQ = checkLineIntersection(p0, cp1, p, cp2, false);
        simplified = chunk[0];

        if (cpQ) {
            comAreaDiff1 = getBezierAreaAccuracy([p0, cpQ, p], area0, areaCptPoly, tolerance).areaDiff

            // can be converted to quadratic
            if (comAreaDiff1 < tolerance) {
                simplified = { type: 'Q', values: [cpQ.x, cpQ.y, p.x, p.y] };
                log.push('cubic to quadratic')
            }
        }
        return simplified
    }


    if (Clen > 1) {
        p0_1 = chunk[1].p0;
        cp1_1 = chunk[1].cp1;
        cp2_1 = type === 'C' ? chunk[1].cp2 : null;
        p_1 = chunk[1].p;

        //get end points
        p_2 = chunk[indexEnd].p;
        cp1_2 = chunk[indexEnd].cp1;
        cp2_2 = type === 'C' ? chunk[indexEnd].cp2 : chunk[indexEnd].cp1;

        areaCptPoly = getPolygonArea([p0, cp1, p_2])

        /**
         * check flatness of chunk
         * beziers might be linots
         */
        let chunkPoints = chunk.map(com => { return [com.p0, com.cp1, com.p] }).flat()
        let { flat, ratio } = commandIsFlat(chunkPoints)
        //console.log('chunkPoints', chunkPoints, flat);

        if (ratio < 0.2) {
            let last = chunkPoints.slice(-1)[0]
            simplified.push({ type: 'L', values: [last.x, last.y] });
            //console.log('last flat', simplified, last);
            log.push('all commands are flat')
            return simplified
        }

    }


    // 3 or more subsequent bezier segments
    if (Clen > 2) {

        /**
         * Cubics to Arcs:
         * educated guess - 
         * check if control points build a right angle
         */
        let { com, isArc, area } = cubicToArc(p0, cp1, cp2_2, p_2);
        areaDiff = getRelativeAreaDiff(area0, area)
        //console.log('flat', chunkPoints, flatness);

        //renderPoint(svg1, p, 'cyan')


        // arc approximations should be more precise - otherwise we prefer cubics
        if (isArc && areaDiff < tolerance * 0.75) {
            simplified = [com];
            //renderPoint(svg1, p, 'orange')
            log.push('cubic to arc')
            return simplified
        }


        /**
         * more than 2 segments
         * try to interpolate tangents from
         * mid control point tangents
         */

        // get mid segment and get tangent intersection
        let p_m = chunk[indexMid].p;

        // get mit segments cps
        let cpMid_1 = type === 'C' ? chunk[indexMid].cp2 : chunk[indexMid].cp1;
        let cp1_Int = checkLineIntersection(p_m, cpMid_1, p0, cp1, false);
        //renderPoint(svg1, p, 'magenta')


        if (cp1_Int) {
            let cp2_Int = checkLineIntersection(p_m, cpMid_1, p_2, cp2_2, false);
            cp1_cubic = cp1_Int;
            cp2_cubic = cp2_Int;

            // extrapolate control points
            cp1_cubic_1 = pointAtT([p0, cp1_cubic], t);
            cp2_cubic_1 = pointAtT([p_2, cp2_cubic], t);

            // test accuracy
            comAreaDiff1 = getBezierAreaAccuracy([p0, cp1_cubic_1, cp2_cubic_1, p_2], area0, areaCptPoly, tolerance);
            accurate = comAreaDiff1.accurate;
            areaDiff1 = comAreaDiff1.areaDiff
            areaDiff = areaDiff1;
            //console.log('3.1: ', areaDiff1);

        }


        /**
         * 2nd try 
         * odd - calculate interpolated mid tangents
         */
        if (!accurate) {
            let controlPoints = type === 'C' ? [p0_1, cp1_1, cp2_1, p_1] : [p0_1, cp1_1, p_1];

            // interpolate mid point in mid segment and get cpts
            ptMid = pointAtT(controlPoints, 0.5, true, true);

            let cp1_mid = type === 'C' ? ptMid.cpts[2] : ptMid.cpts[0];
            cp1_cubic_2 = checkLineIntersection(ptMid, cp1_mid, cp1, p0, false);
            cp2_cubic_2 = checkLineIntersection(ptMid, cp1_mid, cp2_2, p_2, false);


            // extrapolate control points
            cp1_cubic_2 = pointAtT([p0, cp1_cubic_2], t);
            cp2_cubic_2 = pointAtT([p_2, cp2_cubic_2], t);

            // test accuracy
            comAreaDiff2 = getBezierAreaAccuracy([p0, cp1_cubic_2, cp2_cubic_2, p_2], area0, areaCptPoly, tolerance);
            accurate = comAreaDiff2.accurate;
            areaDiff2 = comAreaDiff2.areaDiff
            //console.log('3.2: ', areaDiff2);

        }

        // final 
        cp1_cubic = areaDiff1 < areaDiff2 ? cp1_cubic_1 : cp1_cubic_2
        cp2_cubic = areaDiff1 < areaDiff2 ? cp2_cubic_1 : cp2_cubic_2
        areaDiff = areaDiff1 < areaDiff2 ? areaDiff1 : areaDiff2
        log.push(areaDiff1 < areaDiff2 ? '3.1 is better' : '3.2 is better')

        /*
        if (areaDiff1 < areaDiff2) {
            c_3_1++
            renderPoint(svg1, p, 'purple', '1%')
        }

        // approach 2 is more accurate
        else {
            c_3_2++
            renderPoint(svg1, p, 'cyan', '1%')
        }
        */

        //console.log('3.2.2: ', areaDiff);

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

        //renderPoint(svg1, p0, 'magenta')

        /**
         * Approach 1:
         * get combined control points
         * by extrapolating mid tangent intersection
         */

        // Get cp intersection point
        let cpI, cp1_cubicInter, cp2_cubicInter;

        cpI = checkLineIntersection(p0, cp1, cp2_2, p_2, false);
        if (cpI) {
            cp1_cubicInter = checkLineIntersection(p, cp2_1, p0, cpI, false);
            cp2_cubicInter = checkLineIntersection(p, cp1_2, p_2, cpI, false);
        }

        // extrapolate control points
        cp1_cubic_1 = pointAtT([p0, cp1_cubicInter], t);
        cp2_cubic_1 = pointAtT([p_2, cp2_cubicInter], t);


        // get area to detect sign changes
        comAreaDiff1 = getBezierAreaAccuracy([p0, cp1_cubic_1, cp2_cubic_1, p_2], area0, areaCptPoly, tolerance);

        accurate = comAreaDiff1.accurate;
        areaDiff1 = comAreaDiff1.areaDiff
        //console.log('2.1: ', areaDiff1, cp1_cubic_1, cp2_cubic_1);

        /**
         * If Approach 1 is too imprecise:
         * Approach 2:
         * add segments' cp tangents lengths for
         * combined control points
         */

        if (!accurate) {

            // 1  distances between "tangent handles"
            let t0Length = getDistance(p0, cp1_1);
            let t1Length = getDistance(p_1, cp2_2);

            // new average tangent length
            let t2Length = t0Length + t1Length;
            let tRat0 = t2Length / t0Length;
            let tRat1 = t2Length / t1Length;

            // extrapolate cp tangents
            cp1_cubic_2 = pointAtT([p0, cp1_1], tRat0);
            cp2_cubic_2 = pointAtT([p_1, cp2_2], tRat1);

            // accuracy
            comAreaDiff2 = getBezierAreaAccuracy([p0, cp1_cubic_2, cp2_cubic_2, p_2], area0, areaCptPoly, tolerance);
            accurate = comAreaDiff2.accurate;
            areaDiff2 = comAreaDiff2.areaDiff

        }

        // final 
        cp1_cubic = areaDiff1 < areaDiff2 ? cp1_cubic_1 : cp1_cubic_2
        cp2_cubic = areaDiff1 < areaDiff2 ? cp2_cubic_1 : cp2_cubic_2
        areaDiff = areaDiff1 < areaDiff2 ? areaDiff1 : areaDiff2
        log.push(areaDiff1 < areaDiff2 ? '2.1 is better' : '2.2 is better', areaDiff1, areaDiff2)


        /*
        // approach 1 is more accurate
        if (areaDiff1 < areaDiff2) {
            c_2_1++
            renderPoint(svg1, p, 'pink', '1%')
        }

        // approach 2 is more accurate
        else {
            c_2_2++
            renderPoint(svg1, p, 'orange', '1%')
        }
            */

    }


    // no cpts - return original
    if (!cp1_cubic || !cp2_cubic) {
        return [...chunk];
    }


    // !!! CAN be simplified
    if (areaDiff < tolerance) {
        //console.log('!!! IS simplified!!!', area0, areaSimple);
        simplified.push({ type: 'C', values: [cp1_cubic.x, cp1_cubic.y, cp2_cubic.x, cp2_cubic.y, p_2.x, p_2.y] });
    }

    // !!! no way to simplify
    else {
        simplified = [...chunk];
        //console.log('not simplified!!!', areaDiff, 'area0:', area0, 'areaSimple', areaSimple, tolerance);
        /*
        let d = comSimple.map(com => { return `${com.type} ${com.values.join(' ')}` }).join(' ')
        let d0 = pathDataChunk.map(com => { return `${com.type} ${com.values.join(' ')}` }).join(' ')
        */

    }

    let diffCom = pathDataChunk.length - simplified.length
    log.push('saved:' + diffCom, 'results:' + [c_3_1, c_3_2, c_2_1, c_2_2].join(', '))

    //console.log(log);

    return simplified;
}


