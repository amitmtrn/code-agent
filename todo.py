#!/usr/bin/env python3
"""
Simple command-line Todo List application.

Usage:
  python todo.py add "Buy milk"
  python todo.py list
  python todo.py done 1
  python todo.py remove 1
"""

import json
import os
import sys
from pathlib import Path

DATA_FILE = Path.home() / ".todo.json"


def load_tasks():
    if not DATA_FILE.exists():
        return []
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []


def save_tasks(tasks):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(tasks, f, indent=2)


def add_task(description):
    tasks = load_tasks()
    task = {
        "id": len(tasks) + 1,
        "description": description,
        "done": False,
    }
    tasks.append(task)
    save_tasks(tasks)
    print(f"Added task {task['id']}: {description}")


def list_tasks():
    tasks = load_tasks()
    if not tasks:
        print("No tasks found.")
        return
    for t in tasks:
        status = "✓" if t.get("done") else "✗"
        print(f"{t['id']:>3}. [{status}] {t['description']}")


def mark_done(task_id):
    tasks = load_tasks()
    for t in tasks:
        if t['id'] == task_id:
            t['done'] = True
            save_tasks(tasks)
            print(f"Task {task_id} marked as done.")
            return
    print(f"Task {task_id} not found.")


def remove_task(task_id):
    tasks = load_tasks()
    new_tasks = [t for t in tasks if t['id'] != task_id]
    if len(new_tasks) == len(tasks):
        print(f"Task {task_id} not found.")
        return
    # Reassign ids
    for idx, t in enumerate(new_tasks, start=1):
        t['id'] = idx
    save_tasks(new_tasks)
    print(f"Task {task_id} removed.")


def print_help():
    print("""
Usage:
  todo.py add "task description"
  todo.py list
  todo.py done <id>
  todo.py remove <id>
""")


def main():
    if len(sys.argv) < 2:
        print_help()
        return
    cmd = sys.argv[1]
    if cmd == "add" and len(sys.argv) >= 3:
        add_task(" ".join(sys.argv[2:]))
    elif cmd == "list":
        list_tasks()
    elif cmd == "done" and len(sys.argv) == 3:
        try:
            mark_done(int(sys.argv[2]))
        except ValueError:
            print("Invalid task id.")
    elif cmd == "remove" and len(sys.argv) == 3:
        try:
            remove_task(int(sys.argv[2]))
        except ValueError:
            print("Invalid task id.")
    else:
        print_help()


if __name__ == "__main__":
    main()
