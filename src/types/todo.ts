export type TodoPriority = "low" | "medium" | "high";

export interface TodoItem {
  id: string;           // Change from number to string (UUID from database)
  userId: string;       // Change to string only (UUID)
  task: string;
  category: string;
  completed: boolean;
  priority?: TodoPriority;
  dueDate?: string | null;
  notes?: string;
  createdAt?: number;   // This can stay as number (timestamp)
  updatedAt?: number;
}