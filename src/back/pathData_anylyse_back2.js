import { splitSubpaths } from './pathData_split.js';
import { getAngle, bezierhasExtreme, getPathDataVertices, svgArcToCenterParam, getSquareDistance, commandIsFlat } from "./geometry";
import { getPolygonArea, getPathArea } from './geometry_area.js';
import { getPolyBBox } from './geometry_bbox.js';
import { renderPoint, renderPath } from "./visualize";



/**
 * analyze path data for
 * decimal detection
 * sub paths 
 * directions
 * crucial geometry properties
 */

export function analyzePathData(pathData = [], debug = true) {

    // clone
    pathData = JSON.parse(JSON.stringify(pathData));

    // split to sub paths
    let pathDataSubArr = splitSubpaths(pathData)

    // collect more verbose data
    let pathDataPlus = [];

    // log
    let simplyfy_debug_log = [];

    /**
     * analyze sub paths
     * add simplified bbox (based on on-path-points)
     * get area
     */
    pathDataSubArr.forEach(pathData => {

        let pathDataArea = getPathArea(pathData);
        let pathPoly = getPathDataVertices(pathData);
        let bb = getPolyBBox(pathPoly)
        let { left, right, top, bottom, width, height } = bb;

        // initial starting point coordinates
        let M0 = { x: pathData[0].values[0], y: pathData[0].values[1] };
        let M = { x: pathData[0].values[0], y: pathData[0].values[1] };
        let p0 = { x: pathData[0].values[0], y: pathData[0].values[1] };
        let p;

        // init starting point data
        pathData[0].p0 = M;
        pathData[0].p = M;
        pathData[0].lineto = false;
        pathData[0].corner = false;
        pathData[0].extreme = false;
        pathData[0].directionChange = false;
        pathData[0].closePath = false;


        // add first M command
        let pathDataProps = [pathData[0]];
        let area0 = 0;
        let len = pathData.length;

        for (let c = 2; len && c <= len; c++) {


            let com = pathData[c - 1];
            let { type, values } = com;
            let valsL = values.slice(-2);

            // init properties
            com.lineto = false;
            com.corner = false;
            com.extreme = false;
            com.directionChange = false;
            com.closePath = false;

            /**
             * define angle threshold for 
             * corner detection
             */
            let angleThreshold = 0.01
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


            /**
             * explicit and implicit linetos 
             * - introduced by Z
             */
            if (type === 'L') com.lineto = true;

            if (type === 'Z') {
                com.closePath = true;
                // if Z introduces an implicit lineto with a length
                if (M.x !== M0.x && M.y !== M0.y) {
                    com.lineto = true;
                }
            }


            // is extreme relative to bounding box 
            if (p.x === left || p.y === top || p.x === right || p.y === bottom) {
                com.extreme = true;
                //renderPoint(svg1, p, 'blue', '1.5%')
            }


            // if bezier
            if (type === 'Q' || type === 'C') {
                cp1 = { x: values[0], y: values[1] }
                cp2 = type === 'C' ? { x: values[2], y: values[3] } : null;
                com.cp1 = cp1;
                if (cp2) com.cp2 = cp2;
            }

            /** 
             * add size for decimal calculations 
             * and relative thresholds
             */
            /*
            let size = squareDist ? Math.ceil(0.1 / squareDist) * 3 : 0;
            let decimals = size ? size.toString().length : 0;
            //console.log('decimals', decimals);
            */

            // add to average
            let squareDist = getSquareDistance(p0, p)

            com.size = squareDist;
            let dimA = (width + height) / 2;
            com.dimA = dimA;
            //console.log('decimals', decimals, size);

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


            /**
             * check extremes or corners for adjacent curves by control point angles
             */
            if (type === 'Q' || type === 'C') {

                if ((type === 'Q' && typeN === 'Q') || (type === 'C' && typeN === 'C')) {

                    // check extremes
                    let cpts = type === 'C' ? [cp1, cp2, p] : [cp1, p];


                    /**
                     * check flatness
                     * convert beziers to linetos if
                     * next segment is also flat
                     */

                    //let thresh = dimA*0.05;

                    let w = Math.abs(pN.x - p0.x)
                    let h = Math.abs(pN.y - p0.y)
                    let thresh = (w + h) / 2 * 0.1;
                    //thresh = dimA*0.01;


                    let pts0 = type === 'C' ? [p0, cp1, cp2, p] : [p0, cp1, p];
                    let pts1 = type === 'C' ? [p, cp1N, cp2N, pN] : [p, cp1N, pN];

                    let flatness = commandIsFlat(pts0, thresh)
                    let isFlat = flatness.flat;

                    let flatnessN = commandIsFlat(pts1, thresh)
                    let isFlatN = flatnessN.flat;


                    /*
                    if (isFlat && isFlatN) {
                        renderPoint(svg1, p, 'green')
                        console.log('flat ',flatness, flatnessN);
                        com.type='L'
                        com.values= [p.x, p.y]
                        com.lineto = true;
                    }
                    */


                    let hasExtremes = !com.extreme ? bezierhasExtreme(p0, cpts, angleThreshold) : true
                    //let hasExtremes = bezierhasExtreme(p0, cpts, angleThreshold);

                    if (hasExtremes) {
                        com.extreme = true
                    }

                    // check corners
                    else {

                        let ang3 = getAngle(cp1, p, true);
                        let ang4 = getAngle(p, cp1N, true);
                        let ang5 = cp2 ? getAngle(cp2, p, true) : 0;
                        let ang6 = cp2 ? getAngle(p, cp1N, true) : 0;

                        let cpts1 = cp2 ? [cp2, p] : [cp1, p];
                        let cpts2 = cp2 ? [p, cp1N] : [p, cp1N];

                        let angCom1 = getAngle(...cpts1, true)
                        let angCom2 = getAngle(...cpts2, true)
                        let angDiff = Math.abs(angCom1 - angCom2) * 180/Math.PI


                        let cpDist1 = getSquareDistance(...cpts1)
                        let cpDist2 = getSquareDistance(...cpts2)

                        let cornerThreshold = 10
                        let isCorner = angDiff>cornerThreshold && cpDist1 && cpDist2

                        /*
                        let diffA1 = Math.abs(ang4 - ang3)
                        let diffA2 = cp2 ? Math.abs(ang6 - ang5) : 0

                        angleThreshold = 5
                        angleThreshold = Math.PI/2
                        let isCorner = type === 'C' ? cp2 && diffA2 > angleThreshold : diffA1 > 0.1
                        */

                        /*
                        renderPoint(svg1, cp1, 'cyan' )
                        renderPoint(svg1, p, 'green' )
                        renderPoint(svg1, cp1N, 'orange' )
                        */

                        if (isCorner) {

                            //renderPoint(svg1, cp1, 'cyan' )
                            //renderPoint(svg1, p, 'green', '3%' )
                            //renderPoint(svg1, cp1N, 'orange', '2%' )
    

                            console.log('angDiff', angDiff, cpDist1, cpDist2);
                            com.corner = true;
                        }
                    }
                }
            }


            let debug = false
            debug = true
            if (debug) {

                if (com.extreme) {
                    renderPoint(svg1, p, 'cyan', '1.5%', '0.75')
                }
                if (com.corner) {
                    renderPoint(svg1, p, 'magenta' )
                }
            }


            pathDataProps.push(com)
            p0 = p;

        }


        //decimalsAV = Array.from(decimalsAV)
        //decimalsAV = Math.ceil(decimalsAV.reduce((a, b) => a + b) / decimalsAV.length);

        //console.log('decimalsAV', decimalsAV);
        //pathDataProps[0].decimals = decimalsAV

        //decimalsAV = Math.floor(decimalsAV/decimalsAV.length);
        let dimA = (width + height) / 2
        pathDataPlus.push({ pathData: pathDataProps, bb: bb, area: pathDataArea, dimA: dimA })


        if (simplyfy_debug_log.length) {
            console.log(simplyfy_debug_log);
        }

    })



    return pathDataPlus

}
