import { Box, Flex, IconButton, Tooltip } from "@chakra-ui/react";
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

type Tool = "pen" | "line" | "rect" | "circle" | "arrow" | "eraser";

type Point = { x: number; y: number };

type DrawAction =
  | { type: "pen"; points: Point[]; color: string; width: number }
  | {
      type: "line" | "arrow";
      start: Point;
      end: Point;
      color: string;
      width: number;
    }
  | {
      type: "rect" | "circle";
      start: Point;
      end: Point;
      color: string;
      width: number;
    }
  | { type: "eraser"; points: Point[]; width: number };

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
  const drawing = useRef(false);
  const currentPoints = useRef<Point[]>([]);
  const startPoint = useRef<Point | null>(null);

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
    } else if (action.type === "rect") {
      ctx.strokeStyle = action.color;
      ctx.lineWidth = action.width;
      const x = Math.min(action.start.x, action.end.x);
      const y = Math.min(action.start.y, action.end.y);
      const w = Math.abs(action.end.x - action.start.x);
      const h = Math.abs(action.end.y - action.start.y);
      ctx.strokeRect(x, y, w, h);
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
    }
  }

  function getCanvasPoint(e: React.MouseEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
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
      } as DrawAction;
    }

    if (action) {
      setActions((prev) => [...prev, action!]);
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
          cursor: "crosshair",
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
    </Box>
  );
}
