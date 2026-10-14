// starts node as a child so macOS privacy prompts and full disk access show "ryhome-server" instead of node
#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <sys/wait.h>
#include <unistd.h>

extern char **environ;
static pid_t child = 0;

static void forward(int sig) {
  if (child > 0) kill(child, sig);
}

int main(int argc, char *argv[]) {
  if (argc < 2) {
    fprintf(stderr, "usage: ryhome-server <node> [args...]\n");
    return 64;
  }
  signal(SIGTERM, forward);
  signal(SIGINT, forward);
  signal(SIGHUP, forward);
  if (posix_spawn(&child, argv[1], NULL, NULL, &argv[1], environ) != 0) {
    perror("ryhome-server: couldn't start node");
    return 1;
  }
  int status = 0;
  while (waitpid(child, &status, 0) < 0) {
  }
  if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
  return WEXITSTATUS(status);
}
