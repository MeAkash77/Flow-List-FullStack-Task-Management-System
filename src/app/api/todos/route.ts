import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAccessToken } from "@/lib/auth";

// Helper function to verify token and get userId
async function verifyTokenAndGetUserId(request: Request) {
  const authHeader = request.headers.get("authorization");
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: "Unauthorized", status: 401 };
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyAccessToken(token);
  
  if (!decoded || typeof decoded === 'string' || !decoded.userId) {
    return { error: "Invalid token", status: 403 };
  }

  return { userId: decoded.userId };
}

// CREATE TODO
export async function POST(request: Request) {
  try {
    // Verify authentication
    const auth = await verifyTokenAndGetUserId(request);
    if (auth.error) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    const { userId, task, category, priority, status, dueDate, notes } =
      await request.json();

    // Ensure the userId from token matches the request
    if (auth.userId !== userId) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    if (!userId || !task) {
      return NextResponse.json(
        { error: "User ID and task are required" },
        { status: 400 }
      );
    }

    // Create todo with all fields including status
    const newTodo = await prisma.task.create({
      data: {
        title: task,
        category: category || "General",
        priority: priority || "medium",
        status: status || "todo",
        dueDate: dueDate || null,
        notes: notes || "",
        userId,
        completed: false,
      },
    });

    // Format the response to match TodoItem type with status
    const formattedTodo = {
      id: newTodo.id,
      task: newTodo.title,
      category: newTodo.category || "General",
      priority: (newTodo.priority as "high" | "medium" | "low") || "medium",
      status: (newTodo.status as "todo" | "in-progress" | "done") || "todo",
      dueDate: newTodo.dueDate || "",
      notes: newTodo.notes || "",
      completed: newTodo.completed,
      createdAt: newTodo.createdAt,
    };

    // 🔥 Emit real-time update for new task (with safe check)
    if (typeof global !== 'undefined' && global.io) {
      global.io.emit("task-created-synced", { 
        task: formattedTodo, 
        userId: auth.userId 
      });
    }

    return NextResponse.json(formattedTodo, { status: 201 });
  } catch (error) {
    console.error("Error adding todo:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET TODOS WITH PAGINATION
export async function GET(request: Request) {
  try {
    // Verify authentication
    const auth = await verifyTokenAndGetUserId(request);
    if (auth.error) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get("userId");
    const statusFilter = searchParams.get("status");
    const search = searchParams.get("search") || "";
    
    // Pagination parameters
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    // Ensure users can only access their own todos
    if (requestedUserId && requestedUserId !== auth.userId) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Build where clause with optional status filter and search
    const whereClause: any = { userId: auth.userId };
    if (statusFilter) {
      whereClause.status = statusFilter;
    }
    if (search) {
      whereClause.title = {
        contains: search,
        mode: 'insensitive'
      };
    }

    // Execute both queries in parallel for better performance
    const [todos, total] = await Promise.all([
      prisma.task.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.task.count({
        where: whereClause
      })
    ]);

    // Format todos to match TodoItem type with status
    const formattedTodos = todos.map(todo => ({
      id: todo.id,
      task: todo.title,
      category: todo.category || "General",
      priority: (todo.priority as "high" | "medium" | "low") || "medium",
      status: (todo.status as "todo" | "in-progress" | "done") || "todo",
      dueDate: todo.dueDate || "",
      notes: todo.notes || "",
      completed: todo.completed,
      createdAt: todo.createdAt,
    }));

    // Return paginated response
    return NextResponse.json({
      tasks: formattedTodos,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: page < Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching todos:", error);
    // Return empty paginated response on error
    return NextResponse.json({ 
      tasks: [], 
      pagination: { 
        page: 1, 
        limit: 10, 
        total: 0, 
        pages: 0,
        hasMore: false 
      } 
    });
  }
}

// UPDATE TODO (toggle completed OR update status) - WITH SOCKET EMISSION
export async function PATCH(request: Request) {
  try {
    // Verify authentication
    const auth = await verifyTokenAndGetUserId(request);
    if (auth.error) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    const { todoId, completed, status } = await request.json();

    if (!todoId) {
      return NextResponse.json(
        { error: "Todo ID is required" },
        { status: 400 }
      );
    }

    // Verify the todo belongs to the authenticated user
    const existingTodo = await prisma.task.findFirst({
      where: { 
        id: todoId,
        userId: auth.userId
      }
    });

    if (!existingTodo) {
      return NextResponse.json(
        { error: "Todo not found" },
        { status: 404 }
      );
    }

    // Build update data dynamically
    const updateData: any = {};
    if (completed !== undefined) updateData.completed = completed;
    if (status !== undefined) updateData.status = status;

    // If no fields to update, return existing todo
    if (Object.keys(updateData).length === 0) {
      const formattedTodo = {
        id: existingTodo.id,
        task: existingTodo.title,
        category: existingTodo.category || "General",
        priority: (existingTodo.priority as "high" | "medium" | "low") || "medium",
        status: (existingTodo.status as "todo" | "in-progress" | "done") || "todo",
        dueDate: existingTodo.dueDate || "",
        notes: existingTodo.notes || "",
        completed: existingTodo.completed,
        createdAt: existingTodo.createdAt,
      };
      return NextResponse.json(formattedTodo);
    }

    const updated = await prisma.task.update({
      where: { id: todoId },
      data: updateData,
    });

    // Format the response to match TodoItem type
    const formattedTodo = {
      id: updated.id,
      task: updated.title,
      category: updated.category || "General",
      priority: (updated.priority as "high" | "medium" | "low") || "medium",
      status: (updated.status as "todo" | "in-progress" | "done") || "todo",
      dueDate: updated.dueDate || "",
      notes: updated.notes || "",
      completed: updated.completed,
      createdAt: updated.createdAt,
    };

    // 🔥 Emit real-time update via socket (with safe check)
    if (typeof global !== 'undefined' && global.io) {
      global.io.emit("task-synced", { 
        task: formattedTodo, 
        userId: auth.userId 
      });
    }

    return NextResponse.json(formattedTodo);
  } catch (error) {
    console.error("Error updating todo:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// UPDATE FULL TODO
export async function PUT(request: Request) {
  try {
    // Verify authentication
    const auth = await verifyTokenAndGetUserId(request);
    if (auth.error) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    const { todoId, task, category, priority, status, dueDate, notes, completed } = await request.json();

    if (!todoId) {
      return NextResponse.json(
        { error: "Todo ID is required" },
        { status: 400 }
      );
    }

    // Verify the todo belongs to the authenticated user
    const existingTodo = await prisma.task.findFirst({
      where: { 
        id: todoId,
        userId: auth.userId
      }
    });

    if (!existingTodo) {
      return NextResponse.json(
        { error: "Todo not found" },
        { status: 404 }
      );
    }

    // Update all fields including status
    const updated = await prisma.task.update({
      where: { id: todoId },
      data: {
        title: task,
        category: category,
        priority: priority,
        status: status,
        dueDate: dueDate,
        notes: notes,
        completed: completed,
      },
    });

    const formattedTodo = {
      id: updated.id,
      task: updated.title,
      category: updated.category || "General",
      priority: (updated.priority as "high" | "medium" | "low") || "medium",
      status: (updated.status as "todo" | "in-progress" | "done") || "todo",
      dueDate: updated.dueDate || "",
      notes: updated.notes || "",
      completed: updated.completed,
      createdAt: updated.createdAt,
    };

    // 🔥 Emit real-time update via socket for full updates too (with safe check)
    if (typeof global !== 'undefined' && global.io) {
      global.io.emit("task-synced", { 
        task: formattedTodo, 
        userId: auth.userId 
      });
    }

    return NextResponse.json(formattedTodo);
  } catch (error) {
    console.error("Error updating todo:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE TODO
export async function DELETE(request: Request) {
  try {
    // Verify authentication
    const auth = await verifyTokenAndGetUserId(request);
    if (auth.error) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    const { todoId } = await request.json();

    if (!todoId) {
      return NextResponse.json(
        { error: "Todo ID is required" },
        { status: 400 }
      );
    }

    // Verify the todo belongs to the authenticated user
    const existingTodo = await prisma.task.findFirst({
      where: { 
        id: todoId,
        userId: auth.userId
      }
    });

    if (!existingTodo) {
      return NextResponse.json(
        { error: "Todo not found" },
        { status: 404 }
      );
    }

    await prisma.task.delete({
      where: { id: todoId },
    });

    // 🔥 Emit real-time delete event (with safe check)
    if (typeof global !== 'undefined' && global.io) {
      global.io.emit("task-deleted-synced", { 
        taskId: todoId, 
        userId: auth.userId 
      });
    }

    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error) {
    console.error("Error deleting todo:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}