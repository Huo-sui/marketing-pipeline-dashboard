import { createContext, useContext } from "react";
import type { IdeaRecord, IdeaStatus, ReviewAction, SourcePost } from "../types";

export interface DemoStateValue {
  selectedProject: string;
  setSelectedProject: (project: string) => void;
  sourcePosts: SourcePost[];
  ideas: IdeaRecord[];
  updatePostAction: (id: string, action: ReviewAction) => void;
  updateIdeaStatus: (id: string, status: IdeaStatus) => void;
}

export const DemoState = createContext<DemoStateValue | null>(null);

export function useDemoState() {
  const value = useContext(DemoState);
  if (!value) throw new Error("useDemoState must be used inside DemoStateProvider");
  return value;
}
