import React from 'react';
import { getBezierPath } from 'reactflow';

export default function CustomEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data
}) {
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    // Highlight logic -> if we want to show dynamic stroke width 
    const strokeWidth = data?.thickness || style.strokeWidth || 2;
    const isHighValue = data?.isTop10;

    return (
        <>
            <path
                id={id}
                className={`react-flow__edge-path ${isHighValue ? 'drop-shadow-[0_0_8px_rgba(255,0,0,0.8)]' : ''}`}
                d={edgePath}
                markerEnd={markerEnd}
                style={{
                    ...style,
                    strokeWidth,
                    stroke: isHighValue ? '#ef4444' : style.stroke,
                    transition: 'stroke-width 0.3s ease, stroke 0.3s ease'
                }}
            />
            {data?.label && (
                <foreignObject
                    width={140}
                    height={60}
                    x={labelX - 70}
                    y={labelY - 30}
                    className="edgebutton-foreignobject overflow-visible"
                    requiredExtensions="http://www.w3.org/1999/xhtml"
                >
                    <div className="flex flex-col items-center justify-center font-sans text-[10px] bg-[#0f172a] border border-[#334155] rounded-md px-2 py-1 shadow-md pointer-events-none text-gray-300">
                        <span className={`font-mono font-bold ${isHighValue ? 'text-red-400' : 'text-gray-100'}`}>
                            {data.label}
                        </span>
                        {data.timeLabel && (
                            <span className="text-[9px] text-gray-400">
                                {data.timeLabel}
                            </span>
                        )}
                        {data.count > 1 && (
                            <span className="text-[9px] text-blue-300 bg-blue-900/40 px-1 rounded mt-0.5">
                                {data.count} txs
                            </span>
                        )}
                    </div>
                </foreignObject>
            )}
        </>
    );
}
