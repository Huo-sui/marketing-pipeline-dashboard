import { useMemo, useState, type ReactNode } from "react";
import { initialIdeas, initialSourcePosts } from "../data/demoData";
import { DemoState, type DemoStateValue } from "./demoStateContext";

export function DemoStateProvider({ children }: { children: ReactNode }) {
  const [selectedProject, setSelectedProject] = useState("atlas");
  const [sourcePosts, setSourcePosts] = useState(initialSourcePosts);
  const [ideas, setIdeas] = useState(initialIdeas);

  const value = useMemo<DemoStateValue>(() => ({
    selectedProject,
    setSelectedProject,
    sourcePosts,
    ideas,
    updatePostAction: (id, action) => setSourcePosts((items) => items.map((item) => item.id === id ? { ...item, action } : item)),
    updateIdeaStatus: (id, status) => setIdeas((items) => items.map((item) => item.id === id ? { ...item, status } : item)),
  }), [selectedProject, sourcePosts, ideas]);

  return <DemoState.Provider value={value}>{children}</DemoState.Provider>;
}
