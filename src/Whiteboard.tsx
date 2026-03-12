import { Box, Flex, IconButton, Select, Tooltip } from "@chakra-ui/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  VscCircleLarge,
  VscClearAll,
  VscDiscard,
  VscEdit,
  VscSymbolMisc,
  VscTrash,
} from "react-icons/vsc";

type Tool = "pen" | "line" | "rect" | "circle" | "arrow" | "eraser" | "text";

type Point = { x: number; y: number };

type TextAlign = "left" | "center" | "right";

type DrawAction =
  | { type: "pen"; points: Point[]; color: string; width: number }
  | {
      type: "line" | "arrow";
      start: Point;
      end: Point;
      color: string;
      width: number;
      text?: string;
      fontSize?: number;
      textAlign?: TextAlign;
    }
  | {
      type: "rect" | "circle";
      start: Point;
      end: Point;
      color: string;
      width: number;
      text?: string;
      fontSize?: number;
      textAlign?: TextAlign;
    }
  | { type: "eraser"; points: Point[]; width: number }
  | {
      type: "text";
      position: Point;
      text: string;
      color: string;
      fontSize: number;
      textAlign: TextAlign;
    };

const FONT_SIZES = [12, 16, 20, 24, 32];

const COLORS = [
  "#E53E3E",
  "#DD6B20",
  "#D69E2E",
  "#38A169",
  "#3182CE",
  "#805AD5",
  "#D53F8C",
  "#000000",
  "#FFFFFF",
];

const STROKE_WIDTHS = [2, 4, 6, 8];

type WhiteboardProps = {
  darkMode: boolean;
};

export default function Whiteboard({ darkMode }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#3182CE");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [actions, setActions] = useState<DrawAction[]>([]);
  const [undone, setUndone] = useState<DrawAction[]>([]);
  const [fontSize, setFontSize] = useState(16);
  const [textAlign, setTextAlign] = useState<TextAlign>("center");
  const drawing = useRef(false);
  const currentPoints = useRef<Point[]>([]);
  const startPoint = useRef<Point | null>(null);

  // Text editing overlay state
  const [textEditing, setTextEditing] = useState<{
    actionIndex: number;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [textInputValue, setTextInputValue] = useState("");
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  const bgColor = darkMode ? "#1e1e1e" : "#ffffff";

  // Resize canvas to fill container
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);
  }, []);

  useLayoutEffect(() => {
    resizeCanvas();
  }, [resizeCanvas]);

  useEffect(() => {
    const handleResize = () => {
      resizeCanvas();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [resizeCanvas]);

  // Redraw everything when actions or canvas size changes
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    // Draw background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Draw grid
    ctx.strokeStyle = darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
    ctx.lineWidth = 1;
    const gridSize = 24;
    for (let x = gridSize; x < w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = gridSize; y < h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    for (const action of actions) {
      renderAction(ctx, action);
    }
  }, [actions, bgColor, darkMode]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Also redraw after resize
  useEffect(() => {
    const handleResize = () => {
      resizeCanvas();
      // Defer redraw to next frame so canvas dimensions are updated
      requestAnimationFrame(() => redraw());
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [resizeCanvas, redraw]);

  function renderAction(ctx: CanvasRenderingContext2D, action: DrawAction) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (action.type === "pen") {
      if (action.points.length < 2) return;
      ctx.strokeStyle = action.color;
      ctx.lineWidth = action.width;
      ctx.beginPath();
      ctx.moveTo(action.points[0].x, action.points[0].y);
      for (let i = 1; i < action.points.length; i++) {
        ctx.lineTo(action.points[i].x, action.points[i].y);
      }
      ctx.stroke();
    } else if (action.type === "eraser") {
      // Erase by drawing with background color
      if (action.points.length < 2) return;
      ctx.strokeStyle = bgColor;
      ctx.lineWidth = action.width;
      ctx.beginPath();
      ctx.moveTo(action.points[0].x, action.points[0].y);
      for (let i = 1; i < action.points.length; i++) {
        ctx.lineTo(action.points[i].x, action.points[i].y);
      }
      ctx.stroke();
    } else if (action.type === "line") {
      ctx.strokeStyle = action.color;
      ctx.lineWidth = action.width;
      ctx.beginPath();
      ctx.moveTo(action.start.x, action.start.y);
      ctx.lineTo(action.end.x, action.end.y);
      ctx.stroke();
      // Render inline text for line
      if (action.text) {
        const cx = (action.start.x + action.end.x) / 2;
        const cy = (action.start.y + action.end.y) / 2;
        renderShapeText(ctx, action.text, cx, cy, 120, action.fontSize ?? 16, action.textAlign ?? "center", action.color);
      }
    } else if (action.type === "arrow") {
      ctx.strokeStyle = action.color;
      ctx.fillStyle = action.color;
      ctx.lineWidth = action.width;
      ctx.beginPath();
      ctx.moveTo(action.start.x, action.start.y);
      ctx.lineTo(action.end.x, action.end.y);
      ctx.stroke();
      // Arrowhead
      const angle = Math.atan2(
        action.end.y - action.start.y,
        action.end.x - action.start.x,
      );
      const headLen = 12 + action.width * 2;
      ctx.beginPath();
      ctx.moveTo(action.end.x, action.end.y);
      ctx.lineTo(
        action.end.x - headLen * Math.cos(angle - Math.PI / 6),
        action.end.y - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(
        action.end.x - headLen * Math.cos(angle + Math.PI / 6),
        action.end.y - headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.closePath();
      ctx.fill();
      // Render inline text for arrow
      if (action.text) {
        const cx = (action.start.x + action.end.x) / 2;
        const cy = (action.start.y + action.end.y) / 2;
        renderShapeText(ctx, action.text, cx, cy, 120, action.fontSize ?? 16, action.textAlign ?? "center", action.color);
      }
    } else if (action.type === "rect") {
      ctx.strokeStyle = action.color;
      ctx.lineWidth = action.width;
      const x = Math.min(action.start.x, action.end.x);
      const y = Math.min(action.start.y, action.end.y);
      const w = Math.abs(action.end.x - action.start.x);
      const h = Math.abs(action.end.y - action.start.y);
      ctx.strokeRect(x, y, w, h);
      // Render inline text for rect
      if (action.text) {
        renderShapeText(ctx, action.text, x + w / 2, y + h / 2, w - 8, action.fontSize ?? 16, action.textAlign ?? "center", action.color);
      }
    } else if (action.type === "circle") {
      ctx.strokeStyle = action.color;
      ctx.lineWidth = action.width;
      const cx = (action.start.x + action.end.x) / 2;
      const cy = (action.start.y + action.end.y) / 2;
      const rx = Math.abs(action.end.x - action.start.x) / 2;
      const ry = Math.abs(action.end.y - action.start.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Render inline text for circle
      if (action.text) {
        renderShapeText(ctx, action.text, cx, cy, rx * 1.4, action.fontSize ?? 16, action.textAlign ?? "center", action.color);
      }
    } else if (action.type === "text") {
      renderShapeText(ctx, action.text, action.position.x, action.position.y, 300, action.fontSize, action.textAlign, action.color);
    }
  }

  function renderShapeText(
    ctx: CanvasRenderingContext2D,
    text: string,
    cx: number,
    cy: number,
    maxWidth: number,
    size: number,
    align: TextAlign,
    textColor: string,
  ) {
    if (!text) return;
    ctx.save();
    ctx.font = `${size}px sans-serif`;
    ctx.fillStyle = textColor;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    const lines = text.split("\n");
    const lineHeight = size * 1.2;
    const totalHeight = lines.length * lineHeight;
    const startY = cy - totalHeight / 2 + lineHeight / 2;
    let xPos = cx;
    if (align === "left") xPos = cx - maxWidth / 2;
    else if (align === "right") xPos = cx + maxWidth / 2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], xPos, startY + i * lineHeight, maxWidth);
    }
    ctx.restore();
  }

  function getCanvasPoint(e: React.MouseEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function commitTextEditing() {
    if (textEditing === null) return;
    const value = textInputRef.current?.value ?? textInputValue;
    if (value.trim()) {
      setActions((prev) => {
        const updated = [...prev];
        const action = updated[textEditing.actionIndex];
        if (action && action.type !== "pen" && action.type !== "eraser") {
          updated[textEditing.actionIndex] = { ...action, text: value, fontSize, textAlign } as DrawAction;
        }
        return updated;
      });
    }
    setTextEditing(null);
    setTextInputValue("");
  }

  function getShapeBounds(action: DrawAction): { x: number; y: number; w: number; h: number } | null {
    if (action.type === "rect") {
      const x = Math.min(action.start.x, action.end.x);
      const y = Math.min(action.start.y, action.end.y);
      const w = Math.abs(action.end.x - action.start.x);
      const h = Math.abs(action.end.y - action.start.y);
      return { x, y, w, h };
    } else if (action.type === "circle") {
      const cx = (action.start.x + action.end.x) / 2;
      const cy = (action.start.y + action.end.y) / 2;
      const rx = Math.abs(action.end.x - action.start.x) / 2;
      const ry = Math.abs(action.end.y - action.start.y) / 2;
      return { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 };
    } else if (action.type === "line" || action.type === "arrow") {
      const cx = (action.start.x + action.end.x) / 2;
      const cy = (action.start.y + action.end.y) / 2;
      return { x: cx - 60, y: cy - 20, w: 120, h: 40 };
    } else if (action.type === "text") {
      return { x: action.position.x - 150, y: action.position.y - 20, w: 300, h: 40 };
    }
    return null;
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    // If text editing is active, commit before starting new action
    if (textEditing !== null) {
      commitTextEditing();
      return;
    }
    if (tool === "text") {
      const pt = getCanvasPoint(e);
      const newAction: DrawAction = {
        type: "text",
        position: pt,
        text: "",
        color,
        fontSize,
        textAlign,
      };
      setActions((prev) => {
        const newActions = [...prev, newAction];
        const idx = newActions.length - 1;
        setTextEditing({ actionIndex: idx, x: pt.x - 150, y: pt.y - 20, w: 300, h: 40 });
        return newActions;
      });
      setUndone([]);
      setTextInputValue("");
      return;
    }
    drawing.current = true;
    const pt = getCanvasPoint(e);
    if (tool === "pen" || tool === "eraser") {
      currentPoints.current = [pt];
    } else {
      startPoint.current = pt;
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const pt = getCanvasPoint(e);

    if (tool === "pen" || tool === "eraser") {
      currentPoints.current.push(pt);
      // Live preview: draw current stroke on canvas
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const points = currentPoints.current;
      if (points.length >= 2) {
        ctx.strokeStyle = tool === "eraser" ? bgColor : color;
        ctx.lineWidth = tool === "eraser" ? strokeWidth * 4 : strokeWidth;
        ctx.beginPath();
        ctx.moveTo(points[points.length - 2].x, points[points.length - 2].y);
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        ctx.stroke();
      }
    } else if (startPoint.current) {
      // For shape tools, redraw everything then overlay the in-progress shape
      redraw();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const preview: DrawAction = {
        type: tool,
        start: startPoint.current,
        end: pt,
        color,
        width: strokeWidth,
      } as DrawAction;
      renderAction(ctx, preview);
    }
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    const pt = getCanvasPoint(e);

    let action: DrawAction | null = null;

    if (tool === "pen") {
      if (currentPoints.current.length >= 2) {
        action = {
          type: "pen",
          points: [...currentPoints.current],
          color,
          width: strokeWidth,
        };
      }
    } else if (tool === "eraser") {
      if (currentPoints.current.length >= 2) {
        action = {
          type: "eraser",
          points: [...currentPoints.current],
          width: strokeWidth * 4,
        };
      }
    } else if (startPoint.current) {
      action = {
        type: tool,
        start: startPoint.current,
        end: pt,
        color,
        width: strokeWidth,
        fontSize,
        textAlign,
      } as DrawAction;
    }

    if (action) {
      setActions((prev) => {
        const newActions = [...prev, action!];
        // Show text input for shape tools (rect, circle, line, arrow)
        if (
          action!.type === "rect" ||
          action!.type === "circle" ||
          action!.type === "line" ||
          action!.type === "arrow"
        ) {
          const bounds = getShapeBounds(action!);
          if (bounds) {
            const idx = newActions.length - 1;
            setTextEditing({ actionIndex: idx, ...bounds });
            setTextInputValue("");
          }
        }
        return newActions;
      });
      setUndone([]);
    }

    currentPoints.current = [];
    startPoint.current = null;
  }

  const handleUndo = useCallback(() => {
    setActions((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setUndone((u) => [...u, last]);
      return prev.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setUndone((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setActions((a) => [...a, last]);
      return prev.slice(0, -1);
    });
  }, []);

  function handleClear() {
    setActions([]);
    setUndone([]);
    setTextEditing(null);
    setTextInputValue("");
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo]);

  const toolbarBg = darkMode ? "#2d2d2d" : "#f7f7f7";
  const toolbarBorder = darkMode ? "#444" : "#e2e2e2";
  const activeBg = darkMode ? "#505050" : "#ddd";

  const tools: { id: Tool; label: string; icon: React.ReactElement }[] = [
    { id: "pen", label: "Pen", icon: <VscEdit /> },
    {
      id: "line",
      label: "Line",
      icon: (
        <Box as="span" fontWeight="bold" fontSize="xs">
          ╱
        </Box>
      ),
    },
    {
      id: "arrow",
      label: "Arrow",
      icon: (
        <Box as="span" fontWeight="bold" fontSize="sm">
          →
        </Box>
      ),
    },
    {
      id: "rect",
      label: "Rectangle",
      icon: <VscSymbolMisc />,
    },
    { id: "circle", label: "Circle", icon: <VscCircleLarge /> },
    {
      id: "text",
      label: "Text",
      icon: (
        <Box as="span" fontWeight="bold" fontSize="sm">
          T
        </Box>
      ),
    },
    { id: "eraser", label: "Eraser", icon: <VscClearAll /> },
  ];

  return (
    <Box ref={containerRef} w="100%" h="100%" position="relative">
      {/* Toolbar */}
      <Flex
        position="absolute"
        top={2}
        left="50%"
        transform="translateX(-50%)"
        zIndex={5}
        bg={toolbarBg}
        border="1px solid"
        borderColor={toolbarBorder}
        borderRadius="md"
        p={1}
        gap={1}
        alignItems="center"
        boxShadow="sm"
      >
        {/* Drawing tools */}
        {tools.map((t) => (
          <Tooltip key={t.id} label={t.label} fontSize="xs" placement="bottom">
            <IconButton
              aria-label={t.label}
              icon={t.icon}
              size="sm"
              variant={tool === t.id ? "solid" : "ghost"}
              bg={tool === t.id ? activeBg : undefined}
              onClick={() => setTool(t.id)}
            />
          </Tooltip>
        ))}

        {/* Separator */}
        <Box w="1px" h={5} bg={toolbarBorder} mx={0.5} flexShrink={0} />

        {/* Colors */}
        {COLORS.map((c) => (
          <Tooltip key={c} label={c} fontSize="xs" placement="bottom">
            <Box
              as="button"
              w={5}
              h={5}
              borderRadius="full"
              bg={c}
              border="2px solid"
              borderColor={
                color === c ? (darkMode ? "white" : "gray.800") : "transparent"
              }
              cursor="pointer"
              flexShrink={0}
              onClick={() => setColor(c)}
            />
          </Tooltip>
        ))}

        {/* Separator */}
        <Box w="1px" h={5} bg={toolbarBorder} mx={0.5} flexShrink={0} />

        {/* Stroke widths */}
        {STROKE_WIDTHS.map((sw) => (
          <Tooltip key={sw} label={`${sw}px`} fontSize="xs" placement="bottom">
            <Box
              as="button"
              w={6}
              h={6}
              display="flex"
              alignItems="center"
              justifyContent="center"
              borderRadius="md"
              bg={strokeWidth === sw ? activeBg : "transparent"}
              cursor="pointer"
              onClick={() => setStrokeWidth(sw)}
            >
              <Box
                w={`${Math.min(sw * 2, 14)}px`}
                h={`${Math.min(sw * 2, 14)}px`}
                borderRadius="full"
                bg={darkMode ? "#ccc" : "#555"}
              />
            </Box>
          </Tooltip>
        ))}

        {/* Separator */}
        <Box w="1px" h={5} bg={toolbarBorder} mx={0.5} flexShrink={0} />

        {/* Font size */}
        <Tooltip label="Font size" fontSize="xs" placement="bottom">
          <Select
            aria-label="Font size"
            size="xs"
            w="60px"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            bg={toolbarBg}
            borderColor={toolbarBorder}
          >
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}px
              </option>
            ))}
          </Select>
        </Tooltip>

        {/* Text alignment */}
        {(["left", "center", "right"] as TextAlign[]).map((a) => (
          <Tooltip key={a} label={`Align ${a}`} fontSize="xs" placement="bottom">
            <IconButton
              aria-label={`Align ${a}`}
              icon={
                <Box as="span" fontSize="xs" fontWeight="bold">
                  {a === "left" ? "≡←" : a === "center" ? "≡" : "≡→"}
                </Box>
              }
              size="xs"
              variant={textAlign === a ? "solid" : "ghost"}
              bg={textAlign === a ? activeBg : undefined}
              onClick={() => setTextAlign(a)}
            />
          </Tooltip>
        ))}

        {/* Separator */}
        <Box w="1px" h={5} bg={toolbarBorder} mx={0.5} flexShrink={0} />

        {/* Undo / Redo / Clear */}
        <Tooltip label="Undo (Ctrl+Z)" fontSize="xs" placement="bottom">
          <IconButton
            aria-label="Undo"
            icon={<VscDiscard />}
            size="sm"
            variant="ghost"
            isDisabled={actions.length === 0}
            onClick={handleUndo}
          />
        </Tooltip>
        <Tooltip label="Redo (Ctrl+Shift+Z)" fontSize="xs" placement="bottom">
          <IconButton
            aria-label="Redo"
            icon={<VscDiscard style={{ transform: "scaleX(-1)" }} />}
            size="sm"
            variant="ghost"
            isDisabled={undone.length === 0}
            onClick={handleRedo}
          />
        </Tooltip>
        <Tooltip label="Clear all" fontSize="xs" placement="bottom">
          <IconButton
            aria-label="Clear all"
            icon={<VscTrash />}
            size="sm"
            variant="ghost"
            colorScheme="red"
            onClick={handleClear}
          />
        </Tooltip>
      </Flex>

      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          cursor: tool === "text" ? "text" : "crosshair",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (drawing.current) {
            drawing.current = false;
            currentPoints.current = [];
            startPoint.current = null;
          }
        }}
      />

      {/* Text editing overlay */}
      {textEditing && (
        <textarea
          ref={textInputRef}
          autoFocus
          value={textInputValue}
          onChange={(e) => setTextInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitTextEditing();
            } else if (e.key === "Escape") {
              setTextEditing(null);
              setTextInputValue("");
            }
          }}
          onBlur={() => commitTextEditing()}
          style={{
            position: "absolute",
            left: `${textEditing.x}px`,
            top: `${textEditing.y}px`,
            width: `${Math.max(textEditing.w, 80)}px`,
            height: `${Math.max(textEditing.h, 32)}px`,
            fontSize: `${fontSize}px`,
            textAlign: textAlign,
            color: color,
            background: "transparent",
            border: `1px dashed ${darkMode ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)"}`,
            outline: "none",
            resize: "none",
            overflow: "hidden",
            fontFamily: "sans-serif",
            lineHeight: "1.2",
            padding: "2px 4px",
            zIndex: 10,
            boxSizing: "border-box",
          }}
          placeholder="Type here..."
        />
      )}
    </Box>
  );
}
