import { ReactNode, useEffect, useRef } from 'react';
import './AspectRatioViewport.css';

export const VIEWPORT_ASPECT_RATIO = 16 / 9;
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export type ViewportLayout = 'game' | 'menu';

interface AspectRatioViewportProps {
  children: ReactNode;
  layout?: ViewportLayout;
}

export function AspectRatioViewport({
  children,
  layout = 'menu',
}: AspectRatioViewportProps) {
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const updateScale = () => {
      const width = frame.clientWidth;
      const height = frame.clientHeight;
      const scale = Math.min(width / GAME_WIDTH, height / GAME_HEIGHT, 1.5);
      frame.style.setProperty('--ui-scale', scale.toFixed(4));
      frame.style.setProperty('--frame-min', `${Math.min(width, height)}px`);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [layout]);

  return (
    <div className="viewport-root">
      <div
        ref={frameRef}
        className={`viewport-frame layout-${layout}`}
      >
        {children}
      </div>
    </div>
  );
}

