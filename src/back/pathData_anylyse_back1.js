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

export function analyzePathData(pathData = [], debug=true) {

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
        pathData[0].decimals = 0;

        let decimalsAV = new Set([]);


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
            com.decimals = 0;


            /**
             * define angle threshold for 
             * corner detection
             */
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


            /**
             * explicit and implicit linetos 
             * - introduced by Z
             */
            if (type === 'L') com.lineto = true;

            if (type === 'Z') {
                com.closePath = true;
                //console.log('is implicit lineto', M, 'M0:', M0, p0);

                // if Z introduces an implicit lineto with a length
                if (M.x !== M0.x && M.y !== M0.y) {
                    com.lineto = true;
                }
            }

            /**
             * add parametrized arc data
             */
            if (type === 'A') {
                let arcData = svgArcToCenterParam(p0.x, p0.y, values[0], values[1], values[2], values[3], values[4], p.x, p.y)
                com = Object.assign(com, arcData);
            }


            // is extreme relative to bounding box 
            if (p.x === left || p.y === top || p.x === right || p.y === bottom) {
                com.extreme = true;
                renderPoint(svg1, p, 'cyan', '1%')
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
            let squareDist = getSquareDistance(p0, p)
            let size = squareDist ? Math.ceil(0.1 / squareDist) * 3 : 0;
            let decimals = size ? size.toString().length : 0;
            //console.log('decimals', decimals);

            // add to average
            decimalsAV.add(decimals);
            com.decimals = decimals
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
             * remove short segments
             */
            let tolerance = dimA * 0.01

            if (values.length) {
                // zero length
                if ((p.x === p0.x && p.y === p0.y) || (type === 'L' && squareDist < tolerance)) {
                    console.log('zero', com, squareDist, tolerance);
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

                    /**
                     * detect flat beziers
                     * often used for morphing 
                     * animation
                     */

                    if (type === 'C') {

                        let pts = [p0, cp1, cp2, p];
                        let flatness = commandIsFlat(pts, tolerance)
                        let isFlat = flatness.flat
                        let ratio = flatness.ratio;


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
                                com.type = 'L'
                                com.values = [p.x, p.y];
                                //com = { type: 'L', values: [p.x, p.y] };
                            }
                        }
                    }
                }

            } //end of simplify


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
                    let hasExtremes = !com.extreme ? bezierhasExtreme(p0, cpts, angleThreshold) : true

                    if (hasExtremes) {
                        com.extreme = true
                    }

                    // check corners
                    else {

                        let ang3 = getAngle(cp1, p, true);
                        let ang4 = getAngle(p, cp1N, true);
                        let ang5 = cp2 ? getAngle(cp2, p, true) : 0;
                        let ang6 = cp2 ? getAngle(p, cp1N, true) : 0;

                        let diffA1 = Math.abs(ang4 - ang3)
                        let diffA2 = cp2 ? Math.abs(ang6 - ang5) : 0

                        let isCorner = type === 'C' ? cp2 && diffA2 > angleThreshold : diffA1 > 0.1

                        if (isCorner) {
                            com.corner = true;
                        }
                    }
                }
            }
            pathDataProps.push(com)
            p0 = p;

        }


        decimalsAV = Array.from(decimalsAV)
        decimalsAV = Math.ceil(decimalsAV.reduce((a, b) => a + b) / decimalsAV.length);

        //console.log('decimalsAV', decimalsAV);
        pathDataProps[0].decimals = decimalsAV

        //decimalsAV = Math.floor(decimalsAV/decimalsAV.length);
        let dimA = (width+height)/2
        pathDataPlus.push({ pathData: pathDataProps, bb: bb, area: pathDataArea, decimalsAV: decimalsAV, dimA:dimA })


        if(simplyfy_debug_log.length){
            console.log(simplyfy_debug_log);
        }

    })



    return pathDataPlus

}
