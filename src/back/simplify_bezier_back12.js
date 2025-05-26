import { pathDataArcsToCubics, pathDataQuadraticToCubic, quadratic2Cubic, pathDataToRelative, pathDataToAbsolute, pathDataToLonghands, pathDataToShorthands, pathDataToQuadratic, cubicToQuad, arcToBezier, pathDataToVerbose, convertArrayPathData, revertPathDataToArray, cubicToArc } from './pathData_convert.js';


import { getAngle, bezierhasExtreme, getDistance, getSquareDistance, pointAtT, checkLineIntersection, interpolate, getPointOnEllipse, commandIsFlat } from "./geometry";

import { getPathArea, getPolygonArea, getRelativeAreaDiff } from "./geometry_area.js";

import { renderPoint } from './visualize.js';




/**
 * Function to simplify cubic Bézier sequences
 * thresh defines a threshold based on the 
 * segment size
 * tolerance describes a percentage based deviation 
 * comparing unoptimized against combined segment areas
 */
export function simplifyBezierSequence(chunk, thresh, tolerance = 8) {

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
    let p0_1, cp1_1, cp2_1, p_1;
    let cp1_2, cp2_2, p_2;
    let comSimple, areaSimple, areaDiff, cp1_cubic, cp2_cubic;

    let indexEnd = chunk.length - 1;
    let indexMid = chunk.length > 2 ? Math.floor(chunk.length / 2) - 1 : 1

    // compare accuracy
    let accurate = false;
    let accuracy1 = 10000
    let accuracy2 = 10000
    let cp1_cubic_1, cp2_cubic_1, cp1_cubic_2, cp2_cubic_2;

    //console.log('mid', indexMid, chunk.length );
    //renderPoint(svg1, p, 'pink' )

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


    // 3 or more subsequent bezier segments
    if (Clen > 2) {

        //get end points
        p_2 = chunk[indexEnd].p;
        cp2_2 = type === 'C' ? chunk[indexEnd].cp2 : chunk[indexEnd].cp1;

        /**
         * Cubics to Arcs:
         * educated guess - 
         * check if control points build a right angle
         */

        let { com, isArc, area } = cubicToArc(p0, cp1, cp2_2, p_2);
        areaDiff = getRelativeAreaDiff(area0, area)

        //tolerance*=2
        if (isArc && areaDiff < tolerance) {
            //console.log('areaDiff:', areaDiff, 'area0:', area0, area);
            //console.log(com);
            simplified = [com];
            return simplified
        }


        /**
         * more than 2 segments
         * try to interpolate tangents from
         * mid control point tangents
         */

        let even = Clen % 2 === 0 ? true : false;


        // even - take mid segment control points
        //if (even) {

        // get mid segment and get tangent intersection
        let p_m = chunk[indexMid].p;

        // get mit segments cps
        let cpMid_1 = type === 'C' ? chunk[indexMid].cp2 : chunk[indexMid].cp1;
        let cp1_Int = checkLineIntersection(p_m, cpMid_1, p0, cp1, false);


        if (cp1_Int) {
            let cp2_Int = checkLineIntersection(p_m, cpMid_1, p_2, cp2_2, false);

            cp1_cubic = cp1_Int;
            cp2_cubic = cp2_Int;

            // extrapolate control points
            cp1_cubic = pointAtT([p0, cp1_cubic], t);
            cp2_cubic = pointAtT([p_2, cp2_cubic], t);


            // check area
            comSimple = [
                { type: 'M', values: [p0.x, p0.y] },
                { type: 'C', values: [cp1_cubic.x, cp1_cubic.y, cp2_cubic.x, cp2_cubic.y, p_1.x, p_1.y] }
            ];
            areaSimple = getPathArea(comSimple);

            //let diff = Math.abs(area0 - areaSimple);
            areaDiff = getRelativeAreaDiff(area0, areaSimple)

            accurate = areaDiff < tolerance * 0.2
            console.log('accurate', accurate, areaDiff);


            accuracy1 = areaDiff;
            cp1_cubic_1 = cp1_cubic
            cp2_cubic_1 = cp2_cubic

        }


        /**
         * 2nd try 
         * odd - calculate interpolated mid tangents
         */
        if (!accurate) {
            //console.log('apply alt');
            let controlPoints = type === 'C' ? [p0_1, cp1_1, cp2_1, p_1] : [p0_1, cp1_1, p_1];

            // interpolate mid point in mid segment and get cpts
            let ptMid = pointAtT(controlPoints, 0.5, true, true);

            cp1_cubic = checkLineIntersection(ptMid, ptMid.cpts[0], cp1, p0, false);
            cp2_cubic = checkLineIntersection(ptMid, ptMid.cpts[0], cp2_2, p_2, false);

            // extrapolate control points
            cp1_cubic = pointAtT([p0, cp1_cubic], t);
            cp2_cubic = pointAtT([p_2, cp2_cubic], t);



            // check area
            comSimple = [
                { type: 'M', values: [p0.x, p0.y] },
                { type: 'C', values: [cp1_cubic.x, cp1_cubic.y, cp2_cubic.x, cp2_cubic.y, p_1.x, p_1.y] }
            ];
            areaSimple = getPathArea(comSimple);

            //let diff = Math.abs(area0 - areaSimple);
            areaDiff = getRelativeAreaDiff(area0, areaSimple)

            accurate = areaDiff < tolerance * 0.2
            //console.log('accurate', accurate, areaDiff);

            accuracy2 = areaDiff;
            cp1_cubic_2 = cp1_cubic
            cp2_cubic_2 = cp2_cubic

        }

        // approach 1 is more accurate
        if(accuracy1<accuracy2){
            cp1_cubic = cp1_cubic_1
            cp2_cubic = cp2_cubic_1
            //renderPoint(svg1, p, 'purple')
        }
        /*
        // approach 2 is more accurate
        else{
            //cp1_cubic = cp1_cubic_2
            //cp2_cubic = cp2_cubic_2
            //renderPoint(svg1, p, 'cyan')
        }
        */


    }

    // combine 2 cubic segments
    else if (Clen === 2) {

        //renderPoint(svg1, p, 'blue')

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
        let cpI, cp1_cubicInter, cp2_cubicInter;
        try {
            cpI = checkLineIntersection(p0, cp1, cp2_2, p_2, false);
            cp1_cubicInter = checkLineIntersection(p, cp2_1, p0, cpI, false);
            cp2_cubicInter = checkLineIntersection(p, cp1_2, p_2, cpI, false);
        } catch {
            console.log('!!!catch', 'cpI', p0, 'cp1:', cp1, 'cp2_2:', cp2_2, 'p_2', p_2);
        }

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
        //console.log('try1: ', cp1_cubic, cp2_cubic, areaSimple);


        /**
         * check flatness to adjust
         * tolerance
         */
        let pts0 = type === 'C' ? [p0, cp1, cp2, p] : [p0, cp1, p];
        let flatness = commandIsFlat(pts0, thresh)
        let { flat, ratio } = flatness;


        if (flat && ratio) {
            tolerance /= flatness.ratio
            //renderPoint(svg1, p, 'pink' )
        }



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
            //console.log('try2: ', cp1_cubic, cp2_cubic);

        }

    }


    // no cpts - return original
    if (!cp1_cubic || !cp2_cubic) {
        return [...chunk];
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
        console.log('not simplified!!!', areaDiff, 'area0:', area0, 'areaSimple', areaSimple, tolerance);

        /*
        let d = comSimple.map(com => { return `${com.type} ${com.values.join(' ')}` }).join(' ')
        let d0 = pathDataChunk.map(com => { return `${com.type} ${com.values.join(' ')}` }).join(' ')
        */

        //console.log(d+'\n'+d0);
        //renderPoint(svg1, cp1_cubic, 'orange' )
        //renderPoint(svg1, cp2_cubic, 'orange' )
    }

    return simplified;
}


