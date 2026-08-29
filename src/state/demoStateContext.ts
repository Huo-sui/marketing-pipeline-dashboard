import { createContext, useContext } from "react";
import type { AccountIdentityInput, AccountLifecycleStatus, AccountRecord, AccountSessionStatus, AccountSetupInput, AutomationProfileRecord, IdeaRecord, IdeaStatus, ProjectAccountBinding, ProjectRecord, ProjectSetupInput, ProjectStatus, ReviewAction, SourcePost, SourceReviewState, TopicWatch } from "../types";

export interface DemoStateValue {
  selectedProject: string;
  setSelectedProject: (project: string) => void;
  loading: boolean;
  error?: string;
  refreshWorkspace: () => Promise<void>;
  refreshProjectContent: () => Promise<void>;
  projects: ProjectRecord[];
  accounts: AccountRecord[];
  automationProfiles: AutomationProfileRecord[];
  accountBindings: ProjectAccountBinding[];
  sourcePosts: SourcePost[];
  ideas: IdeaRecord[];
  topicWatches: TopicWatch[];
  updatePostAction: (id: string, action: ReviewAction) => Promise<void>;
  updatePostReview: (ids: string[], state: SourceReviewState) => Promise<void>;
  updateIdeaStatus: (id: string, status: IdeaStatus) => Promise<void>;
  updateIdea: (id: string, patch: Partial<IdeaRecord>) => Promise<void>;
  addIdeas: (items: IdeaRecord[]) => void;
  updateTopicWatch: (id: string, patch: Partial<TopicWatch>) => Promise<void>;
  addTopicWatch: (watch: TopicWatch) => Promise<void>;
  createProjectBundle: (input: ProjectSetupInput) => Promise<string>;
  updateProjectBundle: (projectId: string, input: ProjectSetupInput) => Promise<void>;
  setProjectStatus: (projectId: string, status: ProjectStatus) => Promise<boolean>;
  createAccountBundle: (input: AccountSetupInput) => Promise<string>;
  updateAccountBundle: (accountId: string, input: AccountSetupInput) => Promise<void>;
  setAccountLifecycleStatus: (accountId: string, status: AccountLifecycleStatus) => Promise<boolean>;
  setAccountSessionStatus: (accountId: string, status: AccountSessionStatus, healthMessage?: string) => void;
  confirmAccountIdentity: (accountId: string, identity: AccountIdentityInput, replaceExisting?: boolean) => Promise<boolean>;
}

export const DemoState = createContext<DemoStateValue | null>(null);

export function useDemoState() {
  const value = useContext(DemoState);
  if (!value) throw new Error("useDemoState must be used inside DemoStateProvider");
  return value;
}
