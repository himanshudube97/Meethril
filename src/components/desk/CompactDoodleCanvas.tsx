'use client'

import React, { memo, useState, useCallback, useRef } from 'react'
import { getStroke } from 'perfect-freehand'
import { StrokeData } from '@/store/journal'

// SVG path from stroke points
function getSvgPathFromStroke(stroke: number[][]): string {
  if (!stroke.length) return ''
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
      return acc
    },
    ['M', ...stroke[0], 'Q']
  )
  d.push('Z')
  return d.join(' ')
}

interface Point {
  x: number
  y: number
  pressure?: number
}

interface CompactDoodleCanvasProps {
  strokes: StrokeData[]
  onStrokesChange: (strokes: StrokeData[]) => void
  doodleColors: string[]
  canvasBackground: string
  canvasBorder: string
  textColor: string
  mutedColor: string
  readOnly?: boolean
}

const CompactDoodleCanvas = memo(function CompactDoodleCanvas({
  strokes,
  onStrokesChange,
  doodleColors,
  canvasBackground,
  canvasBorder,
  textColor,
  mutedColor,
  readOnly = false,
}: CompactDoodleCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [localStrokes, setLocalStrokes] = useState<StrokeData[]>(strokes)
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentPoints, setCurrentPoints] = useState<Point[]>([])
  const [activeBrush, setActiveBrush] = useState(1)
  const [selectedColor, setSelectedColor] = useState<string>(doodleColors[0])
  const [isErasing, setIsErasing] = useState(false)

  // Latest strokes mirror, so the eraser callback can read fresh values
  // synchronously across rapid pointermove events without using a setState
  // updater (calling onStrokesChange inside an updater would be a side
  // effect during render and trigger React's setState-in-render warning).
  const strokesRef = useRef(localStrokes)
  strokesRef.current = localStrokes

  const brushes = [
    { name: 'S', size: 2 },
    { name: 'M', size: 4 },
    { name: 'L', size: 8 },
  ]

  // Pointer-to-stroke distance threshold for the eraser. Any stroke that
  // has a sample point within this many px of the pointer gets erased.
  const ERASER_RADIUS = 14

  const getPointFromEvent = useCallback((e: React.PointerEvent): Point => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5,
    }
  }, [])

  // Erase only the portion of each stroke that falls within ERASER_RADIUS
  // of the pointer. A stroke split by an erase becomes multiple sub-strokes
  // (e.g. erasing the middle of a line leaves the two ends behind).
  const eraseAt = useCallback((point: Point) => {
    const prev = strokesRef.current
    let anyChange = false
    const next: StrokeData[] = []
    for (const stroke of prev) {
      let touched = false
      const segments: number[][][] = []
      let current: number[][] = []
      for (const p of stroke.points) {
        const dist = Math.hypot(p[0] - point.x, p[1] - point.y)
        if (dist <= ERASER_RADIUS) {
          if (current.length >= 2) segments.push(current)
          current = []
          touched = true
        } else {
          current.push(p)
        }
      }
      if (current.length >= 2) segments.push(current)

      if (!touched) {
        next.push(stroke)
      } else {
        anyChange = true
        for (const seg of segments) {
          next.push({ color: stroke.color, size: stroke.size, points: seg })
        }
      }
    }
    if (!anyChange) return
    strokesRef.current = next
    setLocalStrokes(next)
    onStrokesChange(next)
  }, [onStrokesChange])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const point = getPointFromEvent(e)
    setIsDrawing(true)
    if (isErasing) {
      eraseAt(point)
      return
    }
    setCurrentPoints([point])
  }, [getPointFromEvent, isErasing, eraseAt])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDrawing) return
    e.preventDefault()
    const point = getPointFromEvent(e)
    if (isErasing) {
      eraseAt(point)
      return
    }
    setCurrentPoints(prev => [...prev, point])
  }, [isDrawing, getPointFromEvent, isErasing, eraseAt])

  const handlePointerUp = useCallback(() => {
    if (!isDrawing) return
    setIsDrawing(false)

    if (!isErasing && currentPoints.length > 0) {
      const brush = brushes[activeBrush]
      const newStroke: StrokeData = {
        points: currentPoints.map(p => [p.x, p.y, p.pressure || 0.5]),
        color: selectedColor,
        size: brush.size,
      }
      const newStrokes = [...localStrokes, newStroke]
      setLocalStrokes(newStrokes)
      onStrokesChange(newStrokes)
    }

    setCurrentPoints([])
  }, [isDrawing, isErasing, currentPoints, activeBrush, selectedColor, localStrokes, onStrokesChange, brushes])

  const clearCanvas = () => {
    setLocalStrokes([])
    setCurrentPoints([])
    onStrokesChange([])
  }

  const renderStroke = (strokeData: StrokeData, index: number) => {
    const outlinePoints = getStroke(strokeData.points, {
      size: strokeData.size,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
    })
    const pathData = getSvgPathFromStroke(outlinePoints)
    return <path key={index} d={pathData} fill={strokeData.color} opacity={0.9} />
  }

  const renderCurrentStroke = () => {
    if (currentPoints.length === 0) return null
    const brush = brushes[activeBrush]
    const outlinePoints = getStroke(
      currentPoints.map(p => [p.x, p.y, p.pressure || 0.5]),
      { size: brush.size, thinning: 0.5, smoothing: 0.5, streamline: 0.5 }
    )
    const pathData = getSvgPathFromStroke(outlinePoints)
    return <path d={pathData} fill={selectedColor} opacity={0.9} />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Compact Toolbar */}
      {!readOnly && (
      <div className="flex items-center gap-1 mb-1">
        {brushes.map((brush, index) => (
          <button
            key={brush.name}
            onClick={() => { setActiveBrush(index); setIsErasing(false) }}
            className="w-6 h-6 rounded text-[10px] transition-all"
            style={{
              background: !isErasing && activeBrush === index ? `${selectedColor}20` : 'rgba(0,0,0,0.03)',
              border: !isErasing && activeBrush === index ? `1px solid ${selectedColor}` : '1px solid rgba(0,0,0,0.08)',
              color: textColor,
            }}
          >
            {brush.name}
          </button>
        ))}
        <button
          onClick={() => setIsErasing((v) => !v)}
          className="w-6 h-6 rounded text-[10px] transition-all flex items-center justify-center"
          style={{
            background: isErasing ? `${textColor}20` : 'rgba(0,0,0,0.03)',
            border: isErasing ? `1px solid ${textColor}` : '1px solid rgba(0,0,0,0.08)',
            color: textColor,
          }}
          title="Eraser"
          aria-pressed={isErasing}
        >
          {/* Pencil-eraser nib */}
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M9.5 2L14 6.5L7.5 13H3V8.5L9.5 2Z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            <path d="M3 13H14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
        <div className="flex-1" />
        {doodleColors.slice(0, 4).map((color) => (
          <button
            key={color}
            onClick={() => { setSelectedColor(color); setIsErasing(false) }}
            className="w-4 h-4 rounded-full transition-all"
            style={{
              background: color,
              border: selectedColor === color ? '2px solid rgba(0,0,0,0.3)' : '1px solid rgba(0,0,0,0.1)',
              transform: selectedColor === color ? 'scale(1.2)' : 'scale(1)',
            }}
          />
        ))}
        <button
          onClick={clearCanvas}
          className="ml-1 w-6 h-6 rounded flex items-center justify-center text-base leading-none transition-opacity opacity-70 hover:opacity-100"
          style={{ color: mutedColor, background: 'rgba(0,0,0,0.03)' }}
          title="Clear all"
          aria-label="Clear all"
        >
          ×
        </button>
      </div>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 relative touch-none rounded-lg overflow-hidden"
        style={{
          background: canvasBackground,
          border: `1px solid ${canvasBorder}`,
          cursor: readOnly ? 'default' : isErasing ? 'cell' : 'crosshair',
          minHeight: '100px',
        }}
        onPointerDown={readOnly ? undefined : handlePointerDown}
        onPointerMove={readOnly ? undefined : handlePointerMove}
        onPointerUp={readOnly ? undefined : handlePointerUp}
        onPointerLeave={readOnly ? undefined : handlePointerUp}
      >
        <svg className="absolute inset-0 w-full h-full">
          {localStrokes.map((stroke, index) => renderStroke(stroke, index))}
          {renderCurrentStroke()}
        </svg>
        {localStrokes.length === 0 && !isDrawing && !readOnly && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm italic" style={{ color: mutedColor, opacity: 0.65 }}>Draw here</span>
          </div>
        )}
      </div>
    </div>
  )
})

export default CompactDoodleCanvas
