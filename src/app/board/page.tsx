"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { motion, AnimatePresence } from "framer-motion";
import {
  ThemeProvider,
  CssBaseline,
  Container,
  Box,
  Paper,
  Typography,
  Chip,
  Stack,
  IconButton,
  Tooltip,
  LinearProgress,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import {
  Add,
  Edit,
  Delete,
  Flag,
  AccessTime,
  DragIndicator,
  MoreVert,
  Close,
} from "@mui/icons-material";
import NavBar from "../components/NavBar";
import { TodoItem, TodoPriority } from "@/types/todo";
import { getAppTheme } from "../theme";
import { socket, connectSocket, disconnectSocket } from "@/lib/socketClient";

type Status = "todo" | "in-progress" | "done";

interface Column {
  name: string;
  color: string;
  gradient: string;
  borderColor: string;
  icon: string;
  items: TodoItem[];
}

const priorityColors: Record<TodoPriority, string> = {
  high: "#d32f2f",
  medium: "#ed6c02",
  low: "#2e7d32",
};

const priorityGradients: Record<TodoPriority, string> = {
  high: "linear-gradient(135deg, #d32f2f, #b71c1c)",
  medium: "linear-gradient(135deg, #ed6c02, #b76e00)",
  low: "linear-gradient(135deg, #2e7d32, #1b5e20)",
};

export default function BoardPage() {
  const [mounted, setMounted] = useState(false);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<Status>("todo");
  const [newTask, setNewTask] = useState({
    task: "",
    category: "General",
    priority: "medium" as TodoPriority,
    dueDate: "",
    notes: "",
  });
  const router = useRouter();

  const theme = getAppTheme(isDarkMode);

  const columns: Record<Status, Column> = {
    "todo": { 
      name: "To Do", 
      color: "#2196f3", 
      borderColor: "border-blue-500",
      gradient: isDarkMode 
        ? "bg-gradient-to-b from-blue-900/30 to-blue-950/30" 
        : "bg-gradient-to-b from-blue-50 to-blue-100/50",
      icon: "📝",
      items: [] 
    },
    "in-progress": { 
      name: "In Progress", 
      color: "#ed6c02", 
      borderColor: "border-yellow-500",
      gradient: isDarkMode 
        ? "bg-gradient-to-b from-yellow-900/30 to-yellow-950/30" 
        : "bg-gradient-to-b from-yellow-50 to-yellow-100/50",
      icon: "⚡",
      items: [] 
    },
    "done": { 
      name: "Done", 
      color: "#2e7d32", 
      borderColor: "border-green-500",
      gradient: isDarkMode 
        ? "bg-gradient-to-b from-green-900/30 to-green-950/30" 
        : "bg-gradient-to-b from-green-50 to-green-100/50",
      icon: "✅",
      items: [] 
    },
  };

  // Group todos by status
  const groupedTodos = todos.reduce((acc, todo) => {
    const status = (todo.status || "todo") as Status;
    if (!acc[status]) acc[status] = [];
    acc[status].push(todo);
    return acc;
  }, {} as Record<Status, TodoItem[]>);

  // Assign to columns
  Object.keys(columns).forEach((key) => {
    columns[key as Status].items = groupedTodos[key as Status] || [];
  });

  // ✅ FIXED: Handle paginated API response
  const fetchTodos = async (userId: string) => {
    try {
      const accessToken = localStorage.getItem("accessToken");
      const response = await fetch(`/api/todos?userId=${userId}`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      const data = await response.json();
      
      // ✅ Handle paginated response format
      let todosArray: TodoItem[] = [];
      
      if (Array.isArray(data)) {
        todosArray = data;
      } else if (data.tasks && Array.isArray(data.tasks)) {
        todosArray = data.tasks;
      } else {
        todosArray = [];
      }
      
      setTodos(todosArray);
    } catch (error) {
      console.error("Error fetching todos:", error);
      setTodos([]);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 Connect to socket when user loads
  useEffect(() => {
    if (user?.id) {
      connectSocket(user.id);
    }

    return () => {
      disconnectSocket();
    };
  }, [user?.id]);

  // 🔥 Listen for real-time updates
  useEffect(() => {
    // Handle task updates from other users
    const handleTaskSynced = (data: { task: TodoItem; userId: string }) => {
      if (data.userId === user?.id) return;
      console.log("📡 Task updated by another user:", data.task);
      setTodos(prev => 
        prev.map(t => t.id === data.task.id ? data.task : t)
      );
    };

    // Handle new tasks from other users
    const handleTaskCreated = (data: { task: TodoItem; userId: string }) => {
      if (data.userId === user?.id) return;
      console.log("📡 New task created by another user:", data.task);
      setTodos(prev => [...prev, data.task]);
    };

    // Handle task deletions from other users
    const handleTaskDeleted = (data: { taskId: string; userId: string }) => {
      if (data.userId === user?.id) return;
      console.log("📡 Task deleted by another user:", data.taskId);
      setTodos(prev => prev.filter(t => t.id !== data.taskId));
    };

    socket.on("task-synced", handleTaskSynced);
    socket.on("task-created-synced", handleTaskCreated);
    socket.on("task-deleted-synced", handleTaskDeleted);

    return () => {
      socket.off("task-synced", handleTaskSynced);
      socket.off("task-created-synced", handleTaskCreated);
      socket.off("task-deleted-synced", handleTaskDeleted);
    };
  }, [user?.id]);

  useEffect(() => {
    setMounted(true);
    const storedDarkMode = JSON.parse(localStorage.getItem("darkMode") || "true");
    setIsDarkMode(storedDarkMode);

    const accessToken = localStorage.getItem("accessToken");
    const storedUser = JSON.parse(localStorage.getItem("currentUser") || "null");

    if (!storedUser || !accessToken) {
      router.push("/auth/login");
      return;
    }

    setUser(storedUser);
    fetchTodos(storedUser.id);
  }, [router]);

  // 🔥 Enhanced handleDragEnd with socket emission
  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;
    
    if (source.droppableId === destination.droppableId && 
        source.index === destination.index) return;

    const task = todos.find(t => t.id === draggableId);
    if (!task) return;

    const newStatus = destination.droppableId as Status;

    // 🔥 1. Update UI INSTANTLY (optimistic update)
    const updatedTask = { ...task, status: newStatus };
    
    setTodos(prev => {
      const updated = prev.map(t => 
        t.id === draggableId ? updatedTask : t
      );
      return updated;
    });

    // 🔥 2. Emit real-time update to other users
    socket.emit("task-updated", {
      task: updatedTask,
      userId: user?.id,
    });

    // 🔥 3. Then call API
    try {
      const accessToken = localStorage.getItem("accessToken");
      await fetch(`/api/todos`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          userId: user?.id,
          todoId: draggableId,
          status: newStatus
        }),
      });
    } catch (error) {
      console.error("Error updating task status:", error);
      // Revert on error
      setTodos(prev => prev.map(t => 
        t.id === draggableId ? { ...t, status: source.droppableId as Status } : t
      ));
    }
  };

  // 🔥 Enhanced addTask with socket emission
  const handleAddTask = async () => {
    if (!newTask.task.trim() || !user) return;

    try {
      const accessToken = localStorage.getItem("accessToken");
      const response = await fetch(`/api/todos`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          userId: user.id,
          task: newTask.task,
          category: newTask.category,
          priority: newTask.priority,
          dueDate: newTask.dueDate || null,
          notes: newTask.notes || "",
          status: selectedColumn,
        }),
      });

      if (response.ok) {
        const newTodo = await response.json();
        
        // Update local state
        setTodos(prev => [...prev, newTodo]);
        
        // 🔥 Emit to other users
        socket.emit("task-created", {
          task: newTodo,
          userId: user.id,
        });
        
        setAddDialogOpen(false);
        setNewTask({
          task: "",
          category: "General",
          priority: "medium",
          dueDate: "",
          notes: "",
        });
      }
    } catch (error) {
      console.error("Error adding task:", error);
    }
  };

  // 🔥 Enhanced deleteTask with socket emission
  const handleDeleteTask = async (taskId: string) => {
    if (!user) return;

    // Optimistic delete
    setTodos(prev => prev.filter(t => t.id !== taskId));

    // 🔥 Emit to other users
    socket.emit("task-deleted", {
      taskId,
      userId: user.id,
    });

    try {
      const accessToken = localStorage.getItem("accessToken");
      await fetch(`/api/todos`, {
        method: "DELETE",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          userId: user.id,
          todoId: taskId,
        }),
      });
    } catch (error) {
      console.error("Error deleting task:", error);
      // Refresh on error
      fetchTodos(user.id);
    }
  };

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    localStorage.setItem("darkMode", JSON.stringify(next));
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("currentUser");
      setUser(null);
      window.location.href = "/auth/login";
    }
  };

  if (!mounted || loading) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif"
      }}>
        <div>Loading board...</div>
      </div>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100vh",
          background: isDarkMode
            ? "radial-gradient(circle at 20% 20%, #0a3d2c 0, #060f0b 35%, #040907 100%)"
            : "radial-gradient(circle at 12% 18%, #d9f2e5 0, #eef7f2 45%, #f5f8f6 100%)",
          color: isDarkMode ? "#e6f3ec" : "#0d2621",
          transition: "background 0.3s ease",
        }}
      >
        <NavBar
          user={user}
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
          onLogout={logout}
        />

        <Container maxWidth="xl" sx={{ py: 4 }}>
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Paper
              elevation={0}
              sx={{
                p: 3,
                mb: 3,
                background: isDarkMode
                  ? "linear-gradient(135deg, #0f3326, #0d5a3f)"
                  : "linear-gradient(135deg, #0f8f5f, #0a6c45)",
                color: "#ffffff",
              }}
            >
              <Typography variant="h4" fontWeight={800}>
                Kanban Board
              </Typography>
              <Typography variant="body1" sx={{ opacity: 0.9 }}>
                Drag and drop tasks to move them between columns
              </Typography>
            </Paper>
          </motion.div>

          <DragDropContext onDragEnd={handleDragEnd}>
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, 
              gap: 3,
            }}>
              {Object.entries(columns).map(([status, column], colIndex) => (
                <motion.div
                  key={status}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: colIndex * 0.1 }}
                >
                  <Droppable droppableId={status}>
                    {(provided, snapshot) => (
                      <Paper
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        elevation={0}
                        sx={{
                          p: 2,
                          minHeight: '70vh',
                          background: column.gradient,
                          border: '1px solid',
                          borderColor: isDarkMode 
                            ? 'rgba(255,255,255,0.08)' 
                            : 'rgba(0,0,0,0.05)',
                          borderTop: `4px solid ${column.color}`,
                          transform: snapshot.isDraggingOver ? 'scale(1.02)' : 'scale(1)',
                          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                          boxShadow: snapshot.isDraggingOver 
                            ? isDarkMode 
                              ? '0 20px 30px rgba(0,0,0,0.5)' 
                              : '0 20px 30px rgba(0,0,0,0.1)'
                            : isDarkMode
                              ? '0 4px 6px rgba(0,0,0,0.3)'
                              : '0 4px 6px rgba(0,0,0,0.05)',
                        }}
                      >
                        {/* Column Header */}
                        <Box
                          sx={{
                            p: 2,
                            mb: 2,
                            borderRadius: 1,
                            background: isDarkMode
                              ? 'rgba(0,0,0,0.3)'
                              : 'rgba(255,255,255,0.7)',
                            backdropFilter: 'blur(10px)',
                          }}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="h6" fontWeight={700}>
                              {column.icon} {column.name}
                            </Typography>
                            <motion.div
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Chip
                                label={column.items.length}
                                size="small"
                                sx={{
                                  bgcolor: column.color,
                                  color: 'white',
                                  fontWeight: 'bold',
                                }}
                              />
                            </motion.div>
                          </Box>
                        </Box>

                        {/* Tasks Container */}
                        <motion.div layout style={{ minHeight: '50vh' }}>
                          <AnimatePresence>
                            {column.items.map((todo, index) => (
                              <Draggable
                                key={todo.id}
                                draggableId={todo.id}
                                index={index}
                              >
                                {(provided, snapshot) => (
                                  <motion.div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    transition={{ duration: 0.2 }}
                                    whileHover={{ 
                                      scale: 1.02,
                                      boxShadow: isDarkMode
                                        ? '0 10px 20px rgba(0,0,0,0.4)'
                                        : '0 10px 20px rgba(0,0,0,0.1)'
                                    }}
                                    whileTap={{ scale: 0.98 }}
                                    layout
                                    style={{ 
                                      marginBottom: '12px',
                                      position: 'relative',
                                      cursor: snapshot.isDragging ? 'grabbing' : 'grab',
                                    }}
                                  >
                                    <Paper
                                      elevation={snapshot.isDragging ? 8 : 2}
                                      sx={{
                                        p: 2,
                                        background: isDarkMode
                                          ? snapshot.isDragging
                                            ? 'linear-gradient(135deg, #1a3d30, #1a4535)'
                                            : 'linear-gradient(135deg, #14261f, #1a2f26)'
                                          : snapshot.isDragging
                                            ? '#ffffff'
                                            : '#f8fbf9',
                                        border: '1px solid',
                                        borderColor: isDarkMode
                                          ? snapshot.isDragging
                                            ? column.color
                                            : 'rgba(255,255,255,0.06)'
                                          : snapshot.isDragging
                                            ? column.color
                                            : 'rgba(0,0,0,0.04)',
                                        position: 'relative',
                                        overflow: 'hidden',
                                        '&::before': {
                                          content: '""',
                                          position: 'absolute',
                                          top: 0,
                                          left: 0,
                                          right: 0,
                                          height: '4px',
                                          background: priorityGradients[todo.priority || 'medium'],
                                        },
                                      }}
                                    >
                                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                        <Box 
                                          {...provided.dragHandleProps}
                                          sx={{ 
                                            mt: 0.5,
                                            cursor: 'grab',
                                            color: 'text.secondary',
                                            '&:active': { cursor: 'grabbing' }
                                          }}
                                        >
                                          <DragIndicator />
                                        </Box>
                                        
                                        <Box sx={{ flex: 1 }}>
                                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <Typography variant="subtitle1" fontWeight={700}>
                                              {todo.task}
                                            </Typography>
                                            <IconButton 
                                              size="small"
                                              onClick={() => handleDeleteTask(todo.id)}
                                              sx={{ 
                                                opacity: 0.6,
                                                '&:hover': { opacity: 1, color: 'error.main' }
                                              }}
                                            >
                                              <Delete fontSize="small" />
                                            </IconButton>
                                          </Box>
                                          
                                          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                                            {todo.category && (
                                              <Chip
                                                size="small"
                                                label={todo.category}
                                                variant="outlined"
                                                sx={{
                                                  borderColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
                                                  color: isDarkMode ? '#eaf7f0' : 'inherit',
                                                }}
                                              />
                                            )}
                                            
                                            {todo.priority && (
                                              <Chip
                                                size="small"
                                                label={todo.priority.toUpperCase()}
                                                icon={<Flag />}
                                                sx={{
                                                  color: priorityColors[todo.priority],
                                                  borderColor: priorityColors[todo.priority],
                                                }}
                                                variant="outlined"
                                              />
                                            )}
                                            
                                            {todo.dueDate && (
                                              <Chip
                                                size="small"
                                                label={todo.dueDate}
                                                icon={<AccessTime />}
                                                variant="outlined"
                                                sx={{
                                                  borderColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
                                                  color: isDarkMode ? '#eaf7f0' : 'inherit',
                                                }}
                                              />
                                            )}
                                          </Stack>
                                        </Box>
                                      </Box>
                                    </Paper>
                                  </motion.div>
                                )}
                              </Draggable>
                            ))}
                          </AnimatePresence>
                          {provided.placeholder}

                          {/* Empty State */}
                          {column.items.length === 0 && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.3 }}
                            >
                              <Box
                                sx={{
                                  textAlign: 'center',
                                  py: 6,
                                  opacity: 0.5,
                                  border: '2px dashed',
                                  borderColor: 'divider',
                                  borderRadius: 2,
                                }}
                              >
                                <Typography variant="body2">
                                  No tasks here
                                </Typography>
                              </Box>
                            </motion.div>
                          )}
                        </motion.div>

                        {/* Add Task Button */}
                        <motion.div
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Button
                            fullWidth
                            variant="outlined"
                            startIcon={<Add />}
                            onClick={() => {
                              setSelectedColumn(status as Status);
                              setAddDialogOpen(true);
                            }}
                            sx={{
                              mt: 2,
                              borderColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
                              color: isDarkMode ? '#eaf7f0' : 'inherit',
                              '&:hover': {
                                borderColor: column.color,
                                backgroundColor: isDarkMode
                                  ? 'rgba(33,150,243,0.1)'
                                  : 'rgba(33,150,243,0.05)',
                              },
                            }}
                          >
                            Add Task
                          </Button>
                        </motion.div>
                      </Paper>
                    )}
                  </Droppable>
                </motion.div>
              ))}
            </Box>
          </DragDropContext>
        </Container>

        {/* Add Task Dialog */}
        <Dialog 
          open={addDialogOpen} 
          onClose={() => setAddDialogOpen(false)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              background: isDarkMode
                ? 'linear-gradient(135deg, #0f3326, #0d5a3f)'
                : 'linear-gradient(135deg, #ffffff, #f5f5f5)',
            }
          }}
        >
          <DialogTitle>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Add Task to {columns[selectedColumn]?.name}
              <IconButton onClick={() => setAddDialogOpen(false)}>
                <Close />
              </IconButton>
            </Box>
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 2 }}>
              <TextField
                label="Task"
                fullWidth
                value={newTask.task}
                onChange={(e) => setNewTask({ ...newTask, task: e.target.value })}
                autoFocus
              />
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  value={newTask.category}
                  label="Category"
                  onChange={(e) => setNewTask({ ...newTask, category: e.target.value })}
                >
                  <MenuItem value="General">General</MenuItem>
                  <MenuItem value="Work">Work</MenuItem>
                  <MenuItem value="Personal">Personal</MenuItem>
                  <MenuItem value="Shopping">Shopping</MenuItem>
                  <MenuItem value="Health">Health</MenuItem>
                  <MenuItem value="Learning">Learning</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Priority</InputLabel>
                <Select
                  value={newTask.priority}
                  label="Priority"
                  onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as TodoPriority })}
                >
                  <MenuItem value="high">High</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="low">Low</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Due Date"
                type="date"
                fullWidth
                value={newTask.dueDate}
                onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Notes"
                fullWidth
                multiline
                rows={2}
                value={newTask.notes}
                onChange={(e) => setNewTask({ ...newTask, notes: e.target.value })}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleAddTask} 
              variant="contained"
              disabled={!newTask.task.trim()}
            >
              Add Task
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}