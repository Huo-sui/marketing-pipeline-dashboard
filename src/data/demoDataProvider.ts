import type {
  BaseRecord, CreateParams, CreateResponse, DataProvider, DeleteOneParams,
  DeleteOneResponse, GetListParams, GetListResponse, GetOneParams, GetOneResponse,
  UpdateParams, UpdateResponse,
} from "@refinedev/core";
import { accounts, generationJobs, initialIdeas, initialSourcePosts, projects, topics } from "./demoData";

const resources: Record<string, BaseRecord[]> = {
  projects,
  topics,
  "source-posts": initialSourcePosts,
  ideas: initialIdeas,
  generation: generationJobs,
  accounts,
};

const collection = (resource: string) => resources[resource] ?? [];

export const demoDataProvider: DataProvider = {
  getApiUrl: () => "demo://marketing-pipeline/v1",
  getList: async <TData extends BaseRecord = BaseRecord>({ resource }: GetListParams): Promise<GetListResponse<TData>> => {
    const data = collection(resource);
    return { data: data as TData[], total: data.length };
  },
  getOne: async <TData extends BaseRecord = BaseRecord>({ resource, id }: GetOneParams): Promise<GetOneResponse<TData>> => {
    const record = collection(resource).find((item) => String(item.id) === String(id));
    if (!record) throw new Error(`Demo resource not found: ${resource}/${id}`);
    return { data: record as TData };
  },
  create: async <TData extends BaseRecord = BaseRecord, TVariables = object>({ resource, variables }: CreateParams<TVariables>): Promise<CreateResponse<TData>> => ({ data: { id: `${resource}-${Date.now()}`, ...variables } as unknown as TData }),
  update: async <TData extends BaseRecord = BaseRecord, TVariables = object>({ resource, id, variables }: UpdateParams<TVariables>): Promise<UpdateResponse<TData>> => ({ data: { ...collection(resource).find((item) => String(item.id) === String(id)), ...variables, id } as unknown as TData }),
  deleteOne: async <TData extends BaseRecord = BaseRecord, TVariables = object>({ resource, id }: DeleteOneParams<TVariables>): Promise<DeleteOneResponse<TData>> => ({ data: (collection(resource).find((item) => String(item.id) === String(id)) ?? { id }) as TData }),
};
