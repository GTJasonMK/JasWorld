#!/usr/bin/env bash
# ============================================================
# 一键启动脚本 — 动态端口 + 资源清理
# 用法:
#   ./scripts/start.sh          # 启动开发服务器
#   ./scripts/start.sh --build  # 构建并预览生产产物
#   ./scripts/start.sh -p 3000  # 指定起始端口
# ============================================================

set -euo pipefail

# ---------- 配置 ----------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PORT_FILE="$PROJECT_DIR/.vite-port"

DEFAULT_PORT=3000
MAX_PORT=$((DEFAULT_PORT + 100))
MODE="dev"

# 防止本地代理拦截 WebSocket 连接
export no_proxy="localhost,127.0.0.1,.local,${no_proxy:-}"

# ---------- 颜色 ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ---------- 全局状态 ----------
VITE_PID=""
HOST_PORT=""
CLEANED_UP=false

# ---------- 解析参数 ----------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --build|-b) MODE="build" ;;
        -p) DEFAULT_PORT="$2"; shift ;;
        --help|-h)
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  --build, -b     构建并预览生产产物"
            echo "  -p <port>       指定起始端口 (默认: 5173)"
            echo "  --help, -h       显示此帮助"
            exit 0
            ;;
        *) echo -e "${RED}未知参数: $1${NC}"; exit 1 ;;
    esac
    shift
done

# ---------- 端口检测 ----------
port_in_use() {
    local pid
    pid=$(ss -tlnp 2>/dev/null | awk -v port="$1" '$0 ~ ":"port" " {print $NF}' | grep -oP 'pid=\K\d+' | head -1)
    if [[ -n "$pid" ]]; then
        return 0
    fi
    # 备选: lsof 检测
    if command -v lsof &>/dev/null; then
        lsof -ti:"$1" &>/dev/null && return 0
    fi
    return 1
}

find_available_port() {
    local port="$1"
    local max="$2"
    while [[ $port -le $max ]]; do
        if port_in_use "$port"; then
            echo -e "${YELLOW}  ⚠ 端口 $port 已被占用,尝试 $((port + 1))...${NC}" >&2
            ((port++))
        else
            echo "$port"
            return 0
        fi
    done
    echo -e "${RED}错误: 端口 $1-$max 全部被占用${NC}" >&2
    return 1
}

# ---------- 资源清理 ----------
cleanup() {
    # 防止重复清理
    if [[ "$CLEANED_UP" == true ]]; then
        return 0
    fi
    CLEANED_UP=true

    echo ""
    echo -e "${YELLOW}正在清理资源...${NC}"

    # 杀掉 vite 子进程
    if [[ -n "$VITE_PID" ]] && kill -0 "$VITE_PID" 2>/dev/null; then
        echo -e "  → 停止 Vite 进程 (PID: $VITE_PID)"
        kill -TERM "$VITE_PID" 2>/dev/null || true
        # 等待进程结束,最多 3 秒
        local waited=0
        while kill -0 "$VITE_PID" 2>/dev/null && [[ $waited -lt 30 ]]; do
            sleep 0.1
            ((waited++))
        done
        # 如果还没退出,强制杀掉
        if kill -0 "$VITE_PID" 2>/dev/null; then
            echo -e "  → 强制终止 Vite 进程"
            kill -KILL "$VITE_PID" 2>/dev/null || true
        fi
    fi

    # 清理占用目标端口的残留进程 (防止 zombie vite)
    if [[ -n "${HOST_PORT:-}" ]]; then
        local stale_pid
        stale_pid=$(ss -tlnp 2>/dev/null | awk -v port="$HOST_PORT" '$0 ~ ":"port" " {print $NF}' | grep -oP 'pid=\K\d+' | head -1)
        if [[ -n "$stale_pid" ]]; then
            echo -e "  → 清理残留端口占用 (PID: $stale_pid, port: $HOST_PORT)"
            kill -KILL "$stale_pid" 2>/dev/null || true
        fi
    fi

    # 删除端口记录文件
    rm -f "$PORT_FILE"
    echo -e "${GREEN}资源清理完成${NC}"
}

# 注册退出信号
trap cleanup EXIT INT TERM

# ---------- 主流程 ----------
cd "$PROJECT_DIR"

echo -e "${BOLD}${CYAN}╔══════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║   光阴的游乐场 · 启动脚本      ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════╝${NC}"
echo ""

# 检查 node_modules
if [[ ! -d "node_modules" ]]; then
    echo -e "${YELLOW}首次运行,安装依赖...${NC}"
    npm install
    echo ""
fi

# 查找可用端口
HOST_PORT=$(find_available_port "$DEFAULT_PORT" "$MAX_PORT") || exit 1
echo "$HOST_PORT" > "$PORT_FILE"

if [[ "$MODE" == "build" ]]; then
    # ========== 构建 + 预览 ==========
    echo -e "${GREEN}[1/2] 正在构建生产产物...${NC}"
    npm run build || { echo -e "${RED}构建失败${NC}"; exit 1; }
    echo ""

    echo -e "${GREEN}[2/2] 启动预览服务器...${NC}"
    npx vite preview --port "$HOST_PORT" --strictPort &
    VITE_PID=$!

    echo ""
    echo -e "${BOLD}${GREEN}✔ 预览服务器已启动${NC}"
    echo -e "  ${CYAN}本地地址:${NC}  ${BOLD}http://localhost:$HOST_PORT/${NC}"
    echo -e "  ${CYAN}进程 PID:${NC}  $VITE_PID"
    echo -e "  ${CYAN}端口记录:${NC}  $PORT_FILE"
else
    # ========== 开发服务器 ==========
    echo -e "${GREEN}启动开发服务器 (HMR 已启用)...${NC}"

    npx vite --port "$HOST_PORT" --strictPort &
    VITE_PID=$!

    echo ""
    echo -e "${BOLD}${GREEN}✔ 开发服务器已启动${NC}"
    echo -e "  ${CYAN}本地地址:${NC}  ${BOLD}http://localhost:$HOST_PORT/${NC}"
    echo -e "  ${CYAN}进程 PID:${NC}  $VITE_PID"
    echo -e "  ${CYAN}端口记录:${NC}  $PORT_FILE"
fi

echo ""
echo -e "${YELLOW}按 Ctrl+C 停止服务器${NC}"
echo ""

# 等待子进程结束
wait "$VITE_PID" 2>/dev/null || true
