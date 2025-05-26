import { pathDataArcsToCubics, pathDataQuadraticToCubic, quadratic2Cubic, pathDataToRelative, pathDataToAbsolute, pathDataToLonghands, pathDataToShorthands, pathDataToQuadratic, cubicToQuad, arcToBezier, pathDataToVerbose, convertArrayPathData, revertPathDataToArray, } from './pathData_convert.js';


import { getAngle, bezierhasExtreme, getDistance, getSquareDistance, pointAtT, checkLineIntersection, interpolate, getPointOnEllipse, commandIsFlat } from "./geometry";

import { getPathArea } from "./geometry_area.js";

import { renderPoint } from './visualize.js';




// Function to simplify cubic Bézier sequences
export function simplifyBezierSequence(chunk, thresh) {
    let simplified = [];
    let Clen = chunk.length;
    let { type, p0, cp1, p, values } = chunk[0];
    let isSimplified = false;

    // get original chunk area for error detection
    let pathDataChunk = [{ type: 'M', values: [p0.x, p0.y] }, ...chunk];
    let area0 = getPathArea(pathDataChunk);


    //console.log('chunk', p0, chunk[0]);
    let cp2 = type === 'C' ? chunk[0].cp2 : null
    let p0_1, cp1_1, cp2_1, cp2_2, p_1, p_2;
    let indexEnd = chunk.length - 1;
    let indexMid = Math.floor(chunk.length / 2)


    if (Clen > 1) {
        p0_1 = chunk[1].p0;
        cp1_1 = chunk[1].cp1;
        cp2_1 = type === 'C' ? chunk[1].cp2 : null;
        p_1 = chunk[1].p;
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


    }


    // 3 subsequent bezier segments
    if (Clen > 2) {
        let cpts = type === 'C' ? [p0_1, cp1_1, cp2_1, p_1] : [p0_1, cp1_1, p_1];


        let ptMid = pointAtT(cpts, 0.6, true);
        let r = 50;
        let ptT = getPointOnEllipse(ptMid.x, ptMid.y, r, r, ptMid.angle);

        let cp1_cubic = checkLineIntersection(ptMid, ptT, cp1, p0, false);
        let cp2_cubic = checkLineIntersection(ptMid, ptT, cp2_2, p_2, false);

        // extrapolate control points
        let t = 1.333;
        cp1_cubic = pointAtT([p0, cp1_cubic], t);
        cp2_cubic = pointAtT([p_2, cp2_cubic], t);

        //renderPoint(svg1, cp2_cubic, 'cyan' )
        //renderPoint(svg1, cp2_cubic, 'cyan' )

        let ptMid_cubic = pointAtT([p0, cp1_cubic, cp2_cubic, p_2], 0.5, true);
        let diff = (Math.abs(ptMid_cubic.x - ptMid.x) + Math.abs(ptMid_cubic.y - ptMid.y)) / 2;
        //renderPoint(svg1, ptMid_cubic, 'cyan' )


        // can be simplified
        if (diff < thresh) {
            //renderPoint(svg1, ptMid_cubic, 'green' )
            isSimplified = true;
            simplified.push({ type: 'C', values: [cp1_cubic.x, cp1_cubic.y, cp2_cubic.x, cp2_cubic.y, p_2.x, p_2.y] });
        }
        // not simplified
        else {
            //renderPoint(svg1, ptMid_cubic, 'cyan' )
            chunk.forEach(com => simplified.push({ type: com.type, values: com.values }));
        }
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



        let t0Length = getSquareDistance(p0, cp1_1);
        let t1Length = getSquareDistance(p_1, cp2_2);

        //let t0Length = getDistance(p0, cp1_1);
        //let t1Length = getDistance(p_1, cp2_2);


        let t2Length = (t0Length + t1Length);
        let tRat0 = t2Length / t0Length;
        let tRat1 = t2Length / t1Length;

        //let ratAv = Math.min(tRat0, tRat1)/2
        //console.log('tratios', tRat0, tRat1);


        let cp1_cubic = pointAtT([p0, cp1_1], tRat0);
        let cp2_cubic = pointAtT([p_1, cp2_2], tRat1);


        /** 
         * adjust too long tangents
         */
        let cp_inter = checkLineIntersection(p0, cp1, p_1, cp2_2, false);
        //renderPoint(svg1, cp_inter, 'purple', '1.5%')

        let dist_cp1 = getSquareDistance(p0, cp1_cubic)
        let dist_cp2 = getSquareDistance(p_1, cp2_cubic)

        let dist_cp1_inter = getSquareDistance(p0, cp_inter)
        let dist_cp2_inter = getSquareDistance(p_1, cp_inter)

        let rat1 = dist_cp1 / dist_cp1_inter
        let rat2 = dist_cp2 / dist_cp2_inter
        //let ratAV = (rat1 + rat2) / 2
        //ratAV = Math.min(rat1, rat2)

        //console.log(rat1, rat2);
        let third = 0.66;
        let rat = 0.85

        let ptMid, cp2_cubic0, cp1_cubic0, cp2_cubic1, cp1_cubic1;

        if (dist_cp1 > dist_cp1_inter * rat) {
            //cp1_cubic = interpolate(p0, cp1_cubic, ratAV)
            //cp2_cubic0 = interpolate(p_1, cp_inter, third)
            cp2_cubic = interpolate(p_1, cp_inter, third)
            cp1_cubic = interpolate(p0, cp_inter, third)

            //renderPoint(svg1, cp1_cubic, 'blue')
            //renderPoint(svg1, cp2_cubic, 'orange')
        }



        if (dist_cp2 > dist_cp2_inter * rat) {
            cp2_cubic = interpolate(p_1, cp_inter, third)
            cp1_cubic = interpolate(p0, cp_inter, third)
            //renderPoint(svg1, cp1_cubic, 'pink')
            //renderPoint(svg1, cp2_cubic, 'yellow')
        }



        ptMid = pointAtT([p0, cp1_1, cp2_1, p], tRat0 * 0.5);
        let ptMid_cubic = pointAtT([p0, cp1_cubic, cp2_cubic, p], 0.5);
        let diff = (Math.abs(ptMid_cubic.x - ptMid.x) + Math.abs(ptMid_cubic.y - ptMid.y)) / 2;


        //try to compine flat
        let pts0 = type === 'C' ? [p0, cp1, cp2, p] : [p0, cp1, p];

        //console.log('pts0', pts0);
        let flatness = commandIsFlat(pts0, thresh)
        let isFlat = flatness.flat;
        isFlat = false;

        if(isFlat){
        //renderPoint(svg1, p, 'pink' )
        }

        // can be simplified
        if (diff < thresh || isFlat) {

            isSimplified = true;
            //renderPoint(svg1, ptMid_cubic, 'pink' )
            //renderPoint(svg1, ptMid, 'cyan' )

            simplified.push({ type: 'C', values: [cp1_cubic.x, cp1_cubic.y, cp2_cubic.x, cp2_cubic.y, p_1.x, p_1.y] });
            //simplified.push({ type: 'C', values: [cp1_cubic.x, cp1_cubic.y, cp2_cubic.x, cp2_cubic.y, p.x, p.y] });
        }
        // no way to simplify
        else {
            //renderPoint(svg1, ptMid_cubic, 'pink' )
            //renderPoint(svg1, ptMid, 'cyan' )
            simplified = [...chunk];

        }
    }

    // not remotely possible to simplify
    else {
        //chunk.forEach(com => simplified.push({ type: com.type, values: com.values }));
        simplified = [...chunk];
    }


    /**
     * take original pathdata 
     * if deviation is too large
     */
    if (isSimplified) {

        let pathDataSimple = [{ type: 'M', values: [p0.x, p0.y] }, ...simplified];
        let area1 = getPathArea(pathDataSimple);

        let diff = Math.abs(area0 - area1);
        //let rat = area0 / area1;
        // deviation in percent
        let deviation = Math.abs(100 - (100 / area0 * (area0 + diff)))

        // console.log('simplified', simplified, isSimplified, 'deviation', deviation);

        if (deviation > 3) {
            simplified = [...chunk];
        }

    }

    /*
    let pathDataChunk = [{type:'M', values:[p0.x, p0.y]}, ...chunk];
    let area0 = getPathArea(pathDataChunk);

    */

    return simplified;
}


