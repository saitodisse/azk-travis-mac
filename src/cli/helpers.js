import { _, t, log, lazy_require, config } from 'azk';
import { AgentNotRunning } from 'azk/utils/errors';

var fmt_p = t('commands.helpers.pull.bar_progress');
var fmt_s = t('commands.helpers.pull.bar_status');
var bar_opts = {
    complete: '='
  , incomplete: ' '
  , width: 30
  , total: 100
}

lazy_require(this, {
  AgentClient: ['azk/agent/client', 'Client'],
  Configure: ['azk/agent/configure', 'Configure'],
});

var Helpers = {
  requireAgent() {
    return AgentClient.require();
  },

  configure(cli) {
    cli.ok('configure.loading_checking');
    return (new Configure(cli))
      .run()
      .then((configs) => {
        cli.ok('configure.loaded');
        return configs;
      });
  },

  manifestValidate(cmd, manifest) {
    if (config('flags:show_deprecate')) {
      _.each(manifest.validate(), (error) => {
        cmd[error.level](`manifest.validate.${error.key}`, error);
      });
    }
  },

  vmStartProgress(cmd) {
    return (event) => {
      if (!event) return;

      var context = event.context || "agent"
      var keys    = ["status", context];

      switch(event.type) {
        case "status":
          // running, starting, not_running, already
          switch(event.status) {
            case "not_running":
            case "already":
              cmd.fail([...keys, event.status], event.data);
              break;
            case "error":
              if (event.data instanceof Error) {
                cmd.fail(event.data.toString())
              } else {
                cmd.fail([...keys, event.status], event);
              }
              break;
            default:
              if (event.keys) {
                cmd[event.status || "ok"](event.keys, event.data);
              } else {
                cmd.ok([...keys, event.status], event.data);
              }
          }
          break;
        case "try_connect":
          var tKey = [...keys, "progress"];
          log.info_t(tKey, event);
          cmd.ok(tKey, event);
          break;
        case "ssh":
          if (context == "stderr")
            break;
        default:
          log.debug(event);
      }
    };
  },

  newPullProgress(cmd) {
    var mbars = cmd.newMultiBars();
    var bars  = {};

    return (event) => {
      if (event.type != "pull_msg" || !event.id) return event;

      var status = event.statusParsed;
      var title  = `${event.id}:`;
      var bar    = bars[event.id] || cmd.newBar(mbars, fmt_p, bar_opts);

      switch(status.type) {
        case 'download':
          var progress = event.progressDetail;
          var tick     = progress.current - bar.curr;
          bar.total    = progress.total + 1;
          bar.tick(tick, { title, progress: event.progress });
          break;
        default:
          bar.tick(bar.curr, { title, fmt: fmt_s, msg: event.status });
      }

      bars[event.id] = bar;

      return false;
    }
  },

  escapeCapture(callback) {
    // Escape sequence
    var escapeBuffer = false;
    var escape = false;

    return (event) => {
      if (event.type == "stdin_pipe") {
        var stdin  = event.data[0].stdin;
        var stream = event.data[0].stream;
        var container = event.id;
        var stopped = false;

        stdin.on('data', function (key) {
          if (stopped) return false;

          var ch = key.toString(stdin.encoding || 'utf-8');

          if (escapeBuffer && ch === '~') {
            escapeBuffer = false;
            escape = true;
          } else if(ch === '\r') {
            escapeBuffer = true;
            stream.write(key);
          } else {
            if (escape) {
              stopped = callback(ch, container);
              escape = false;
            } else {
              stream.write(key);
            }
            escapeBuffer = false;
          }
        });
      }
      return true;
    }
  }
}

export { Helpers };
