require("nvim-tree").setup({
  auto_reload_on_write = false,
  disable_netrw = false,
  hijack_cursor = false,
  hijack_netrw = true,
  hijack_unnamed_buffer_when_opening = false,
  sort_by = "name",
  root_dirs = {},
  prefer_startup_root = false,
  sync_root_with_cwd = true,
  reload_on_bufenter = false,
  respect_buf_cwd = false,
  -- on_attach = "default",
  select_prompts = false,
  view = {
    adaptive_size = false,
    centralize_selection = false,
    width = 30,
    side = "left",
    preserve_window_proportions = false,
    number = false,
    relativenumber = false,
    signcolumn = "yes",
    float = {
      enable = false,
      quit_on_focus_loss = true,
      open_win_config = {
        relative = "editor",
        border = "rounded",
        width = 30,
        height = 30,
        row = 1,
        col = 1,
      },
    },
  },
  hijack_directories = {
    enable = false,
    auto_open = true,
  },
  update_focused_file = {
    enable = true,
    debounce_delay = 15,
    update_root = true,
    ignore_list = {},
  },
  -- diagnostics = {
  --   enable = lvim.use_icons,
  --   show_on_dirs = false,
  --   show_on_open_dirs = true,
  --   debounce_delay = 50,
  --   severity = {
  --     min = vim.diagnostic.severity.HINT,
  --     max = vim.diagnostic.severity.ERROR,
  --   },
  --   icons = {
  --     hint = lvim.icons.diagnostics.BoldHint,
  --     info = lvim.icons.diagnostics.BoldInformation,
  --     warning = lvim.icons.diagnostics.BoldWarning,
  --     error = lvim.icons.diagnostics.BoldError,
  --   },
  -- },
  filters = {
    dotfiles = false,
    git_clean = false,
    no_buffer = false,
    custom = { "node_modules", "\\.cache" },
    exclude = {},
  },
  filesystem_watchers = {
    enable = true,
    debounce_delay = 50,
    ignore_dirs = {},
  },
  git = {
    enable = true,
    ignore = false,
    show_on_dirs = true,
    show_on_open_dirs = true,
    timeout = 2000,
  },
  actions = {
    use_system_clipboard = true,
    change_dir = {
      enable = true,
      global = false,
      restrict_above_cwd = false,
    },
    expand_all = {
      max_folder_discovery = 300,
      exclude = {},
    },
    file_popup = {
      open_win_config = {
        col = 1,
        row = 1,
        relative = "cursor",
        border = "shadow",
        style = "minimal",
      },
    },
    open_file = {
      quit_on_open = false,
      resize_window = false,
      window_picker = {
        enable = true,
        picker = "default",
        chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
        exclude = {
          filetype = { "notify", "lazy", "qf", "diff", "fugitive", "fugitiveblame" },
          buftype = { "nofile", "terminal", "help" },
        },
      },
    },
    remove_file = {
      close_window = true,
    },
  },
  trash = {
    cmd = "trash",
    require_confirm = true,
  },
  live_filter = {
    prefix = "[FILTER]: ",
    always_show_folders = true,
  },
  tab = {
    sync = {
      open = false,
      close = false,
      ignore = {},
    },
  },
  notify = {
    threshold = vim.log.levels.INFO,
  },
  log = {
    enable = false,
    truncate = false,
    types = {
      all = false,
      config = false,
      copy_paste = false,
      dev = false,
      diagnostics = false,
      git = false,
      profile = false,
      watcher = false,
    },

  },
  system_open = {
    cmd = nil,
    args = {},
  },
  -- disable_netrw = false,
  -- hijack_netrw = true,
  -- sort_by = "name",
  -- auto_reload_on_write = false,
  -- hijack_unnamed_buffer_when_opening = false,
  -- hijack_directories = {
  --   enable = true,
  --   auto_open = true,
  -- },
  open_on_tab = false,
  -- hijack_cursor = false,
  update_cwd = true,
  diagnostics = {
    enable = false,
    show_on_dirs = false,
    icons = {
      hint = "",
      info = "",
      warning = "",
      error = "",
    },
    show_on_open_dirs = true,
    debounce_delay = 50,
    severity = {
      min = vim.diagnostic.severity.HINT,
      max = vim.diagnostic.severity.ERROR,
    },
  },
  -- update_focused_file = {
  --   enable = true,
  --   update_cwd = true,
  --   ignore_list = {},
  -- },
  -- system_open = {
  --   cmd = nil,
  --   args = {},
  -- },
  -- git = {
  --   enable = true,
  --   ignore = false,
  --   timeout = 200,
  -- },
  renderer = {
    add_trailing = false,
    group_empty = false,
    highlight_git = true,
    full_name = false,
    highlight_opened_files = "none",
    root_folder_label = ":t",
    indent_width = 2,
    indent_markers = {
      enable = false,
      inline_arrows = true,
      icons = {
        corner = "└",
        edge = "│",
        item = "│",
        none = " ",
      },
    },
    special_files = { "Cargo.toml", "Makefile", "README.md", "readme.md" },
    symlink_destination = true,

    icons = {
      webdev_colors = true,
      show = {
        git = true,
        folder = true,
        file = true,
        folder_arrow = true,
      },
      glyphs = {
        default = "",
        symlink = "",
        git = {
          unstaged = "",
          staged = "S",
          unmerged = "",
          renamed = "➜",
          deleted = "",
          untracked = "U",
          ignored = "◌",
        },
        folder = {
          default = "",
          open = "",
          empty = "",
          empty_open = "",
          symlink = "",
        },
      },
    },
    root_folder_modifier = ":t",
  },
  -- filters = {
  --   dotfiles = false,
  --   -- custom = { "node_modules", "\\.cache", ".husky", ".next", ".vscode", ".git" },
  --   exclude = {},
  -- },
  -- trash = {
  --   cmd = "trash",
  --   require_confirm = true,
  -- },
  -- log = {
  --   enable = false,
  --   truncate = false,
  --   types = {
  --     all = false,
  --     config = false,
  --     copy_paste = false,
  --     diagnostics = false,
  --     git = false,
  --     profile = false,
  --   },
  -- },
  -- actions = {
  --   use_system_clipboard = true,
  --   change_dir = {
  --     enable = true,
  --     global = false,
  --     restrict_above_cwd = false,
  --   },
  --   open_file = {
  --     quit_on_open = false,
  --     resize_window = false,
  --     window_picker = {
  --       enable = true,
  --       chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
  --       exclude = {
  --         filetype = { "notify", "packer", "qf", "diff", "fugitive", "fugitiveblame" },
  --         buftype = { "nofile", "terminal", "help" },
  --       },
  --     },
  --   },
  -- },
  on_attach = function(bufnr)
    local api = require("nvim-tree.api")
    local keymap = vim.keymap.set

    local function opts(desc)
      return { desc = "nvim-tree: " .. desc, buffer = bufnr, noremap = true, silent = true, nowait = true }
    end

    api.config.mappings.default_on_attach(bufnr)

    keymap("n", "v", api.node.open.vertical, opts("CD"))
    keymap("n", "h", api.node.navigate.parent_close, opts("Close Directory"))
    keymap("n", "l", api.node.open.edit, opts("Open"))
  end,
})
