import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { username } = await request.json();

    // Validate input
    if (!username) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }

    // Find the user by username using Prisma
    const user = await prisma.user.findUnique({
      where: { username }
    });

    // Check if the user exists
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Return success response (without password)
    const { password: _, ...userWithoutPassword } = user;

    return NextResponse.json(
      {
        message: "User verified successfully",
        user: userWithoutPassword
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("Error verifying user:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}