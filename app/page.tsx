"use client"

import dynamic from "next/dynamic"

const VisualizerCanvas = dynamic(() => import("@/components/visualizer/visualizer-canvas"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-[#030303]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00ffff30] border-t-[#00ffff]" />
        <span className="text-xs uppercase tracking-widest text-[#444]">Initializing</span>
      </div>
    </div>
  ),
})

export default function Page() {
  return <VisualizerCanvas />
}
