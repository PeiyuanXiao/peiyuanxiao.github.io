# .Rprofile — project-local R startup for the Academic CV (HugoBlox) Hugo site.
# Makes blogdown::serve_site() work in RStudio while keeping the toolchain and
# all build caches on F:, never C:.
#
# NOTE: intentionally does NOT set options(blogdown.hugo.dir=...). Pointing that
# at our flat F:\dev\hugo folder makes blogdown "adopt" it and move hugo.exe into
# a versioned subfolder, which breaks the PATH entry pnpm/CLI rely on. blogdown
# finds Hugo on PATH just fine and leaves it in place.

local({
  dev <- "F:/dev"
  if (dir.exists(dev)) {
    win  <- function(p) gsub("/", "\\\\", p)               # forward -> back slashes
    bins <- win(file.path(dev, c("hugo", "nodejs", "go/bin", "gopath/bin", "pnpm")))
    cur  <- strsplit(Sys.getenv("PATH"), ";", fixed = TRUE)[[1]]
    add  <- bins[!(tolower(bins) %in% tolower(cur))]        # idempotent: no dupes
    if (length(add)) Sys.setenv(PATH = paste(c(add, cur), collapse = ";"))

    caches <- list(
      HUGO_CACHEDIR = "hugo-cache", GOPATH = "gopath",
      GOMODCACHE = "gopath/pkg/mod", GOCACHE = "gocache", GOTMPDIR = "gotmp"
    )
    for (k in names(caches)) {
      if (Sys.getenv(k) == "") do.call(Sys.setenv, setNames(list(win(file.path(dev, caches[[k]]))), k))
    }
  }
  options(repos = c(CRAN = "https://cloud.r-project.org"))  # official CRAN CDN (US), no China mirror
})

if (interactive()) {
  message("[academic-cv] F: toolchain ready in this R session.")
  message("  Preview:  blogdown::serve_site()   |   Stop:  blogdown::stop_server()")
}
