import { pathDataArcsToCubics, pathDataQuadraticToCubic, quadratic2Cubic, pathDataToRelative, pathDataToAbsolute, pathDataToLonghands, pathDataToShorthands, pathDataToQuadratic, cubicToQuad, arcToBezier, pathDataToVerbose, convertArrayPathData, revertPathDataToArray, } from './convert_pathData.js';

import { getAngle, bezierhasExtreme, getDistance, getSquareDistance, pointAtT, checkLineIntersection, interpolate, getPointOnEllipse } from "./geometry";

import { renderPoint } from './visualize.js';




// Function to simplify cubic Bézier sequences
export function simplifyBezierSequence(chunk, thresh) {
    let simplified = [];
    let Clen = chunk.length;
    let { type, p0, cp1, p, values } = chunk[0];

    //console.log('chunk', p0, chunk[0]);
    let cp2 = type === 'C' ? chunk[0].cp2 : null
    let p0_1, cp1_1, cp2_1, cp2_2, p_1, p_2;

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
    }


    // 3 subsequent bezier segments
    if (Clen === 3) {
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

        if (diff < thresh) {
            simplified.push({ type: 'C', values: [cp1_cubic.x, cp1_cubic.y, cp2_cubic.x, cp2_cubic.y, p_2.x, p_2.y] });
        } else {
            chunk.forEach(com => simplified.push({ type: com.type, values: com.values }));
        }
    }

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


        let t2Length = t0Length + t1Length;
        let tRat0 = t2Length / t0Length;
        let tRat1 = t2Length / t1Length;

        //let ratAv = Math.min(tRat0, tRat1)/2
        //console.log('taratios', tRat0, tRat1);


        let cp1_cubic = pointAtT([p0, cp1_1], tRat0);
        let cp2_cubic = pointAtT([p_1, cp2_2], tRat1);


        //adjust too long tangents
        let cp_inter = checkLineIntersection(p0, cp1, p_1, cp2_2, false);
        //renderPoint(svg1, cp_inter, 'purple', '1.5%')

        let dist_cp1 = getSquareDistance(p0, cp1_cubic)
        let dist_cp2 = getSquareDistance(p_1, cp2_cubic)

        let dist_cp1_inter = getSquareDistance(p0, cp_inter)
        let dist_cp2_inter = getSquareDistance(p_1, cp_inter)

        let rat1 = dist_cp1 / dist_cp1_inter
        let rat2 = dist_cp2 / dist_cp2_inter
        let ratAV = (rat1 + rat2) / 2
        ratAV = Math.min(rat1, rat2)

        //console.log(rat1, rat2);
        let third = 0.66;
        let rat = 0.85

        if (dist_cp1 > dist_cp1_inter * rat) {
            cp1_cubic = interpolate(p0, cp1_cubic, ratAV)
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



        /*
        if(tRat0>2 ){
            renderPoint(svg1, cp1_cubic, 'blue')
            //tRat0 = tRat0>2 ? tRat0*0.5 : tRat0;
        }

        if(tRat1>2 ){
            renderPoint(svg1, cp2_cubic, 'orange')
            //tRat0 = tRat0>2 ? tRat0*0.5 : tRat0;
        }
        */


        let ptMid = pointAtT([p0, cp1_1, cp2_1, p], tRat0 * 0.5);
        let ptMid_cubic = pointAtT([p0, cp1_cubic, cp2_cubic, p], 0.5);
        let diff = (Math.abs(ptMid_cubic.x - ptMid.x) + Math.abs(ptMid_cubic.y - ptMid.y)) / 2;



        if (diff < thresh) {
            simplified.push({ type: 'C', values: [cp1_cubic.x, cp1_cubic.y, cp2_cubic.x, cp2_cubic.y, p_1.x, p_1.y] });
        } else {
            chunk.forEach(com => simplified.push({ type: com.type, values: com.values }));
        }
    } else {
        chunk.forEach(com => simplified.push({ type: com.type, values: com.values }));
    }


    return simplified;
}


