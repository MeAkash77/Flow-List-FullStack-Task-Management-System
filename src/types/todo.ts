// src/types/todo.ts

export type TodoPriority = "low" | "medium" | "high";
export type TodoStatus = "todo" | "in-progress" | "done";

export interface TodoItem {
  id: string;                    // UUID from database
  userId: string;                // User ID (UUID)
  task: string;                  // Task title/description
  category: string;              // Task category (e.g., "Work", "Personal")
  completed: boolean;            // Completed status
  priority?: TodoPriority;       // Priority level (low, medium, high)
  status?: TodoStatus;           // NEW: Status (todo, in-progress, done)
  dueDate?: string | null;       // Due date as ISO string
  notes?: string;                // Additional notes
  createdAt?: number;            // Timestamp (Unix epoch in milliseconds)
  updatedAt?: number;            // Timestamp (Unix epoch in milliseconds)
}

// Optional: Create type for creating a new todo
export interface CreateTodoInput {
  task: string;
  category?: string;
  completed?: boolean;
  priority?: TodoPriority;
  status?: TodoStatus;
  dueDate?: string | null;
  notes?: string;
}

// Optional: Create type for updating a todo
export interface UpdateTodoInput {
  task?: string;
  category?: string;
  completed?: boolean;
  priority?: TodoPriority;
  status?: TodoStatus;
  dueDate?: string | null;
  notes?: string;
}

// Optional: Create type for todo filters
export interface TodoFilters {
  category?: string;
  priority?: TodoPriority;
  status?: TodoStatus;
  completed?: boolean;
  search?: string;
}

// Optional: Helper function to convert Prisma Task to TodoItem
export function prismaTaskToTodoItem(task: any): TodoItem {
  return {
    id: task.id,
    userId: task.userId,
    task: task.title, // Map Prisma's 'title' to our 'task' field
    category: task.category,
    completed: task.completed,
    priority: task.priority as TodoPriority,
    status: task.status as TodoStatus,
    dueDate: task.dueDate,
    notes: task.notes,
    createdAt: task.createdAt ? new Date(task.createdAt).getTime() : undefined,
    updatedAt: task.updatedAt ? new Date(task.updatedAt).getTime() : undefined,
  };
}

// Optional: Helper function to convert TodoItem to Prisma Task input
export function todoItemToPrismaTask(todo: Partial<TodoItem>, userId: string) {
  return {
    title: todo.task, // Map our 'task' field to Prisma's 'title'
    category: todo.category,
    completed: todo.completed,
    priority: todo.priority,
    status: todo.status,
    dueDate: todo.dueDate,
    notes: todo.notes,
    userId: userId,
  };
}