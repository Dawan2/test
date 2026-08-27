/* ============ media.js 火山引擎生图/生视频客户端(经服务端 /api/volc 代理,Key 不出前端) ============ */
(function () {
  const Media = {
    /* 后端在线且有 token 即可用(代理模式需先登录后端) */
    isReady() { return !!(window.Store && Store.getToken()); },

    /* 从 UI 模型标签('渠道,名称,model-id')提取真实上游 model id;标注(模拟)的返回 null(走服务端默认模型) */
    realModel(label) {
      if (!label) return null;
      const id = String(label).split(',')[2];
      return id && !id.includes('模拟') ? id.trim() : null;
    },

    /* 统一代理请求:带 token 鉴权 + AbortController 超时,错误消息对齐 api.js 风格 */
    async _req(path, opts, timeoutMs) {
      const token = window.Store && Store.getToken();
      if (!token) throw new Error('未登录后端,无法调用生图/生视频代理');
      // 成本归集标签:项目页内发起的计费调用注入 _projectId(服务端 operation 台账按项目聚合;指纹不参与)
      if (opts && opts.body && window.__billPid) {
        try {
          const b = JSON.parse(opts.body);
          if (b && typeof b === 'object' && !b._projectId) opts = Object.assign({}, opts, { body: JSON.stringify(Object.assign(b, { _projectId: window.__billPid })) });
        } catch (_) { /* 非 JSON body 原样透传 */ }
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res;
      try {
        res = await fetch(path, Object.assign({
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          signal: ctrl.signal,
        }, opts || {}));
      } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') throw new Error('请求超时(' + Math.round(timeoutMs / 1000) + 's),请稍后重试');
        throw new Error('无法连接本地后端,请确认已运行 node server.js');
      }
      // 超时保护覆盖响应体读取:读完再清计时器(服务端发头后挂起时不再无限等待)
      let j = null;
      try { j = await res.json(); } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') throw new Error('请求超时(' + Math.round(timeoutMs / 1000) + 's),请稍后重试');
        j = null; // 非 JSON 响应体,走下方统一错误分支
      }
      clearTimeout(timer);
      if (!res.ok || !j || j.code !== 0) {
        const msg = (j && j.message) || ('代理请求失败(' + res.status + ')');
        if (res.status === 401) { if (window.U && U.authExpired) U.authExpired(); throw new Error('登录已过期,请重新登录'); }
        throw new Error(msg);
      }
      return j.data;
    },

    /* 审核类错误判定(与 friendlyError 的合规正则同源):命中则切线路无意义,直接抛 */
    _isAuditError(e) {
      return /违禁|敏感|审核|不合规|risk|moderat|nsfw|policy|illegal|violat/i.test(String((e && e.message) || e || ''));
    },

    /* ---------- 结果认领(R15 断点闭环) ----------
     * 同步生成端点(TTS/FFmpeg)客户端超时后,服务端可能已交付:结果落服务端 results.json(保留 7 天)。
     * recoverResult 按 opId 主动领取(幂等,服务端标 claimed);_withRecover 在超时错误时先即时领取
     * 一次(覆盖"服务端恰好已完成"窗口),命中返回结果(附 __recovered:true);未命中原样抛出并附
     * __opId + __recoverable——任务中心「领取结果」按钮可稍后按 opId 再次找回。 */
    async recoverResult(operationId) {
      if (!operationId) return null;
      try {
        const d = await this._req('/api/operations/' + encodeURIComponent(String(operationId)) + '/result', null, 15000);
        return d && d.found && d.payload ? d : null;
      } catch (_) { return null; }
    },
    async _withRecover(operationId, fn) {
      try { return await fn(); }
      catch (e) {
        if (e && typeof e === 'object') {
          if (!e.__opId && operationId) e.__opId = operationId;
          if (/^请求超时/.test(String(e.message || '')) && operationId) {
            const rec = await this.recoverResult(operationId);
            if (rec) { rec.payload.__recovered = true; return rec.payload; }
            e.__recoverable = true; // 服务端可能仍在执行:结果稍后可从任务中心领取
          }
        }
        throw e;
      }
    },

    /* 备用线路标签(双线路冗余):优先全局配置
     * Store.state.settings.defImageBackup/defVideoBackup;值为 '无' 表示显式不启用;
     * 未设置回退 MODELS 数组第 2 条;都没有或与主线路相同则返回 null(不 failover) */
    _backupLabel(kind, mainLabel) {
      const key = kind === 'image' ? 'defImageBackup' : 'defVideoBackup';
      let b = (window.Store && Store.state && Store.state.settings && Store.state.settings[key]) || '';
      if (b === '无') return null;
      if (!b) b = (window.MODELS && MODELS[kind] && MODELS[kind][1]) || '';
      if (!b) return null;
      const bId = this.realModel(b); // 与主线路按真实 model id 去重(mainLabel 已是 realModel 提取后的 id)
      if (!bId || bId === mainLabel) return null;
      return b;
    },

    /* 主线路失败后的备用线路重试公共流程:打印告警 + 全局 toast,返回备线标签 */
    _switchBackup(kind, mainLabel, e) {
      const backup = this._backupLabel(kind, mainLabel);
      if (!backup) return null;
      console.warn('[Media] ' + (kind === 'image' ? '生图' : '生视频') + '主线路失败,切换备用线路重试:', (e && e.message) || e);
      if (window.U && U.toast) U.toast('主线路失败,已自动切换备用线路重试', 'info');
      return backup;
    },

    /* 文生图(可选参考图 i2i;image 传数组=多图融合,≤6 张):返回 {url, remoteUrl},url 为服务端本地缓存路径(刷新后仍可访问)。
     * 生图较慢(约 60-70s),超时 180s。主线路失败(审核类除外)自动用备用线路重试一次,
     * 成功时返回对象附 __line:'backup';两次都失败抛原始错误(调用方退费语义不变)。
     * operationId 透传服务端按次扣费幂等键(服务端权威计费;备用线路重试生成新键=新一次计费,旧次由失败退费冲销);
     * billingAction 透传服务端白名单定价(不同用途生图价格不同,缺省 image.gen) */
    async genImage({ prompt, size, model, image, operationId, billingAction }) {
      if (!prompt) throw new Error('prompt 不能为空');
      // 八轮:失败统一附 err.__opId(与 genVideo 同约)——调用方 Tasks.run/U.refund 镜像后服务端按原账单退该 operation
      const tag = e => { if (e && typeof e === 'object' && !e.__opId) e.__opId = operationId; return e; };
      const post = opId => this._req('/api/volc/image', {
        method: 'POST',
        body: JSON.stringify({ prompt, size, model, image, operationId: opId, billingAction }),
      }, 180000);
      try {
        return await post(operationId);
      } catch (e) {
        tag(e);
        if (this._isAuditError(e)) throw e; // 审核拦截换线路无意义,直接抛
        /* 十三轮:网络层错误(超时/断连)先按同 opId 原请求重试一次——首轮可能已交付只是响应
         * 丢失,服务端结果日志直接恢复(recovered:true 不重复扣费);首轮仍在执行则 409 落到
         * 备用线路;真失败则复用已有扣费(non-llm-recharge)重执行,均不产生额外计费 */
        if (/^请求超时|^无法连接本地后端/.test(String(e.message || ''))) {
          try {
            const r = await post(operationId);
            r.__line = 'retry-same';
            return r;
          } catch (_) { /* 原线路重试仍失败:继续走备用线路 */ }
        }
        const backup = this._switchBackup('image', model, e);
        if (!backup) throw e;
        try {
          const r = await this._req('/api/volc/image', {
            method: 'POST',
            body: JSON.stringify({ prompt, size, model: this.realModel(backup), image, operationId: operationId ? operationId + '_b' : undefined, billingAction }),
          }, 180000);
          r.__line = 'backup';
          return r;
        } catch (e2) {
          tag(e2);
          throw e2;
        }
      }
    },

    /* 单次视频生成:创建任务后轮询(每 6s),直到 succeeded 返回 {videoUrl, remoteUrl},
     * failed/超时(10 分钟)抛错。onProgress(status) 可选回调;
     * job:{projectId,episodeId,shotId} 透传服务端任务中心(同镜同输入幂等复用);
     * onCreated(id) 在任务创建成功时回调(调用方落 upstreamId 到 state,供刷新后断点续查);
     * cost 传入时复用分支自动退费(调用前 U.charge 已扣本地,服务端复用未扣,原路退回);
     * operationId 透传服务端按次扣费幂等键;billingAction 透传白名单定价(节拍板长段落 video.beat,缺省 video.gen) */
    async _genVideoOnce({ prompt, ratio, duration, model, image, lastFrame, refVideo, refImages, refAudio, onProgress, job, onCreated, cost, operationId, billingAction }) {
      const opId = operationId || ('op_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
      const created = await this._req('/api/volc/video', {
        method: 'POST',
        body: JSON.stringify({ prompt, ratio, duration, model, image, lastFrame, refVideo, refImages, refAudio, job, operationId: opId, billingAction }),
      }, 60000);
      const id = created.id;
      if (!id) throw new Error('视频任务创建失败:未返回任务 id');
      // 服务端按模型支持档位吸附时长(如 2.0 仅 5s/10s):与请求不一致时如实提示
      if (created.duration && duration && created.duration !== +duration && window.U && U.toast) {
        U.toast(`时长 ${duration}s 不在当前模型支持档位,已自动按 ${created.duration}s 生成`, 'info', 3500);
      }
      // 混用兜底提示:首尾帧与主体参考图不可同包时,服务端已去首尾帧、以主体参考为准
      if (created.droppedFrames && window.U && U.toast) {
        U.toast('当前模型不支持首尾帧与主体参考图同包,本次以主体参考为准(已自动去掉首帧/尾帧)', 'info', 4000);
      }
      // 隐私告知:参考视频经公共临时托管中转(服务端 relayUploadEnabled 可关)
      if (created.relayedVideo && window.U && U.toast) {
        U.toast('参考视频已临时上传至公共中转服务(约 1 小时后过期)供上游回源,如需禁用请在 config.json 设 relayUploadEnabled:false', 'info', 5000);
      }
      if (created.reused) {
        // 复用原上游任务:服务端未扣费,调用前本地已扣(U.charge)→ 原路退回(镜像退费与本地退费对称)
        if (window.U && U.refund) {
          if (cost) U.refund(cost, '复用原上游任务不重复计费', opId);
          if (U.toast) U.toast('检测到该镜头同参数任务仍在生成,已复用原上游任务(不重复计费)', 'info', 3500);
        }
      }
      if (onCreated) try { onCreated(id); } catch (_) { /* 回调异常不影响生成 */ }
      const deadline = Date.now() + 10 * 60 * 1000;
      // 九轮:10 分钟到点不再退款——上游偶发超时任务可能仍在生成(平台已付上游成本)。
      // __pending 标记"可续查":调用方不退本地镜像积分;用户重新点「生成」时同 opId 同内容幂等续查
      // (服务端步骤幂等,不重复扣费);服务端 30 分钟标 stale(轮询查完上游再定)、60 分钟未终态
      // 由 sweepJobs 终极退款兜底(十轮两档,任务在第 30 分钟附近成功不再被误退款)。
      // 状态查询容错:连续瞬时失败(网络抖动/单次超时)容忍 3 次指数退避(6s→12s→24s)再判死,
      // 避免上游任务可能已成功却因一次查询失败整体报错退费(重试则上游双份生成)
      let pollErrs = 0;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 6000 * Math.pow(2, Math.min(pollErrs, 3))));
        let st;
        try {
          st = await this._req('/api/volc/video/' + encodeURIComponent(id), null, 30000);
          pollErrs = 0;
        } catch (e) {
          pollErrs++;
          if (pollErrs >= 3) throw e;
          continue;
        }
        if (onProgress) onProgress(st.status);
        if (st.status === 'succeeded') {
          if (!st.videoUrl) throw new Error('视频生成成功但未返回视频地址');
          return st;
        }
        if (st.status === 'failed') throw new Error('视频生成失败' + (st.error ? ':' + st.error : ''));
        // 退款终态(八轮;十一轮语义:timed_out=60 分钟未终态且对账上游无结果)——不再等待,积分已退回
        if (st.status === 'timed_out' || st.status === 'cancelled') {
          throw new Error(st.error || (st.status === 'timed_out' ? '任务超时,积分已由服务端退回' : '任务已取消并退款'));
        }
      }
      // 超时:任务仍在后台生成,不退款(见上方注释);__noRefund 让 Tasks.run/调用方跳过本地退费镜像
      const terr = new Error('视频生成超时(10 分钟),任务仍在后台生成——稍后可重新点击「生成」免费续查结果;若最终失败服务端将自动退费(60 分钟兜底)');
      terr.__pending = true;
      terr.__noRefund = true;
      throw terr;
    },

    /* 断点续查:按 upstreamId 查询一次上游任务状态(刷新中断后恢复用,返回与轮询同构的 {status,videoUrl,...}) */
    async checkVideo(id) {
      if (!id) throw new Error('缺少任务 id');
      return this._req('/api/volc/video/' + encodeURIComponent(String(id)), null, 30000);
    },

    /* 取消在途任务(R19):服务端转 cancelled 终态并按原账单退款(幂等);晚到的上游成功不再交付。
     * 返回 {cancelled, refunded, already};终态任务 409、他人任务 403,调用方按错误如实提示。 */
    async cancelVideo(id) {
      if (!id) throw new Error('缺少任务 id');
      return this._req('/api/volc/video/' + encodeURIComponent(String(id)) + '/cancel', { method: 'POST', body: '{}' }, 20000);
    },

    /* 登录自动对账:拉取服务端任务中心,按 shotId/upstreamId 对账本机中断的生成任务(免刷新恢复)。
     * 上游已成功 → 直接落片(不重复扣费);仍在生成 → 保持/标记可续查;已失败或服务端无记录 → 标 failed 供重试。
     * 十一轮 P1-5:节拍板段落(beats)同样纳入自动对账——此前只有用户手动再点「生成」才走续查,刷新后
     * generating 状态悬挂;节拍任务在服务端以复合键 'beat:<epId>:<idx>' 登记,按此定位。
     * 仅扫描当前登录用户自己的项目(本地多账号共享 localStorage,混扫会用别人账号处理他人镜头);
     * 返回 false=会话未就绪或任务中心不可达(调用方不落"已对账"标记,下次路由再试) */
    async reconcileJobs() {
      const me = window.Store && Store.currentUser && Store.currentUser();
      if (!this.isReady() || !me) return false;
      let jobs;
      try { jobs = ((await this._req('/api/jobs', null, 20000)) || {}).list || []; }
      catch (_) { return false; } // 任务中心不可达:下次启动再试
      if (window.Tasks && Tasks._cacheRemoteJobs) Tasks._cacheRemoteJobs(jobs); // 十二轮:刷新同步删除路径共享的远端任务快照
      const pend = [];
      (Store.state.projects || []).forEach(p => {
        if (p.userId !== me.id) return; // 只对账本人项目
        (p.episodes || []).forEach(ep => {
          (ep.shots || []).forEach(s => {
            if (s.video && (s.video.status === 'generating' || (s.video.status === 'failed' && s.video.upstreamId)))
              pend.push({ p, ep, kind: 'shot', s });
          });
          // 十一轮 P1-5:节拍板段落同样对账(shotId 复合键 beat:<epId>:<idx>,与服务端登记一致)
          (ep.beats || []).forEach(b => {
            if (b.video && (b.video.status === 'generating' || (b.video.status === 'failed' && b.video.upstreamId)))
              pend.push({ p, ep, kind: 'beat', s: b });
          });
        });
      });
      if (!pend.length) return true;
      let recovered = 0, inflight = 0, lost = 0;
      for (const { p, ep, kind, s } of pend) {
        // 对账定位:优先 upstreamId 精确匹配;无 upstreamId 的旧数据按 shotId(节拍为复合键)取最近任务
        const scopeKey = kind === 'beat' ? 'beat:' + ep.id + ':' + s.idx : s.id;
        let job = jobs.find(j => j.upstreamId && s.video.upstreamId && j.upstreamId === s.video.upstreamId);
        if (!job) {
          const byShot = jobs.filter(j => j.shotId === scopeKey);
          job = byShot.find(j => j.status === 'running') || byShot[0];
        }
        if (!job || !job.upstreamId) {
          // 本机在途但服务端无对应任务:真失联(旧版本遗留/登记被清),标失败可重试;failed 原样保留
          if (s.video.status === 'generating') {
            s.video = { status: 'failed', error: '任务失联(服务端无对应记录),请重新生成', model: s.video.model };
            lost++;
          }
          continue;
        }
        let st;
        if (job.status === 'succeeded' && job.videoUrl) st = { status: 'succeeded', videoUrl: job.videoUrl }; // 已知终态:免查上游
        else if (job.status === 'timed_out') st = { status: 'failed', error: '任务超时(60 分钟未终态,积分已由服务端自动退回),请重新生成' }; // 服务端超时清扫终态:不再查上游
        else if (job.status === 'cancelled') st = { status: 'failed', error: '任务已随退款取消(客户端超时退款联动),请重新生成' }; // 八轮:退款取消终态:不再查上游
        else {
          try { st = await this.checkVideo(job.upstreamId); } // 查询顺带回写服务端任务中心(含超时清理/needs_reconcile 对账)
          catch (_) { continue; } // 单镜查询失败:保留现状,下次启动再试
          // 十一轮:对账后上游仍无终态 → 服务端已 timed_out+退款(终态);cancelled 同理
          if (st.status === 'timed_out' || st.status === 'cancelled') {
            st = { status: 'failed', error: st.error || '任务超时/已取消,积分已由服务端退回,请重新生成' };
          }
        }
        if (st.status === 'succeeded' && st.videoUrl) {
          try {
            if (kind === 'beat') {
              // 节拍段落片:与 genBeat 手动续查同构(帧命名 beat_<pid>_<idx>,无 assetVer/inputHash 维度)
              const frame = await this.captureFrameUp(st.videoUrl, 0.1, 'beat_' + p.id + '_' + s.idx + '.jpg');
              s.video = { status: 'done', url: st.videoUrl, frame: frame || PH.video(`${s.name}|${(s.frames[0] || {}).text || ep.title}`, s.idx) };
            } else {
              const frame = await this.captureFrameUp(st.videoUrl, 0.1, 'frame_' + s.id + '.jpg');
              const tail = await this.captureFrameUp(st.videoUrl, 'end', 'tail_' + s.id + '.jpg');
              const keepVer = s.video.assetVer, keepHash = s.video.inputHash; // 发起时指纹=中断前真实输入,优先沿用;存量无指纹才按当前输入现算
              s.video = { status: 'done', model: s.video.model || '', url: st.videoUrl, frame: frame || PH.video(s.plot, s.order), assetVer: keepVer !== undefined ? keepVer : Store.shotAssetVer(p, s), inputHash: keepHash || Store.shotInputHash(p, s), upstreamId: job.upstreamId };
              s.image = s.image || frame || PH.shot(s.plot, s.order);
              s.lastFrame = tail || frame || s.lastFrame;
            }
            recovered++;
          } catch (_) { /* 截帧/上传异常:保留现状,下次启动再试 */ }
        } else if (st.status === 'failed') {
          if (s.video.status !== 'failed' || s.video.upstreamId !== job.upstreamId) {
            s.video = { status: 'failed', error: st.error || '上游生成失败', model: s.video.model, upstreamId: job.upstreamId, assetVer: s.video.assetVer, inputHash: s.video.inputHash }; // 发起时指纹一并保留,后续续查落片不按新输入误记
            lost++;
          }
        } else {
          inflight++; // running/queued:generating 保持;failed(本地误判超时)回标可续查,点「生成」即恢复
          if (s.video.status === 'failed') { s.video.resumable = true; }
        }
      }
      if (recovered || lost) {
        Store.save();
        U.toast(`任务对账:恢复 ${recovered} 个已完成视频` + (inflight ? `,${inflight} 个仍在生成` : '') + (lost ? `,${lost} 个失败/失联(可重新生成)` : ''), recovered ? 'success' : 'info', 5000);
        if (window.__reroute) { try { window.__reroute(); } catch (_) { } } // 对账落片后刷新当前页
      }
      return true; // 会话有效且任务中心可达:调用方可落"已对账"标记
    },

    /* 文生视频(可选首帧参考图 i2v / 参考视频 refVideo 用于视频编辑):主线路创建失败或任务 failed 时
     * 自动用备用线路重建一次(审核类错误/轮询超时不切线路,超时避免 10 分钟等待翻倍;备线沿用同一套轮询参数),
     * 成功时返回对象附 __line:'backup';两次都失败抛原始错误(调用方退费语义不变)。
     * 失败抛错统一附带 err.__opId(计费操作键):调用方 U.refund(..., __opId) 镜像后服务端按原账单退该 operation */
    async genVideo(opt) {
      opt = Object.assign({}, opt);
      opt.operationId = opt.operationId || ('op_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)); // 生成后稳定持有:失败路径可附带
      const tag = e => { if (e && typeof e === 'object' && !e.__opId) e.__opId = opt.operationId; return e; };
      try {
        return await this._genVideoOnce(opt);
      } catch (e) {
        tag(e);
        if (this._isAuditError(e)) throw e; // 审核拦截换线路无意义,直接抛
        if (/超时/.test(String((e && e.message) || ''))) throw e; // 轮询超时(10 分钟)不切线路
        const backup = this._switchBackup('video', opt.model, e);
        if (!backup) throw e;
        try {
          const r = await this._genVideoOnce(Object.assign({}, opt, { model: this.realModel(backup), operationId: opt.operationId + '_b' }));
          r.__line = 'backup';
          return r;
        } catch (e2) {
          tag(e2);
          throw e2;
        }
      }
    },

    /* 视频截帧:seek 到指定秒(默认 0.1s;传 'end' 取结尾前 0.1s,用于尾帧)后 canvas 截帧,
     * 返回 dataURL(跨域/失败返回 null,调用方回退占位帧) */
    captureFrame(videoUrl, tSec) {
      return new Promise(resolve => {
        const v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.crossOrigin = 'anonymous';
        const done = url => { v.src = ''; resolve(url); };
        const timer = setTimeout(() => done(null), 15000);
        v.onerror = () => { clearTimeout(timer); done(null); };
        v.onloadeddata = () => {
          try { v.currentTime = tSec === 'end' ? Math.max(0, (v.duration || 1) - 0.1) : (tSec || 0.1); }
          catch (_) { clearTimeout(timer); done(null); }
        };
        v.onseeked = () => {
          clearTimeout(timer);
          try {
            const cv = document.createElement('canvas');
            cv.width = v.videoWidth || 480; cv.height = v.videoHeight || 270;
            cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
            done(cv.toDataURL('image/jpeg', 0.85));
          } catch (_) { done(null); }
        };
        v.src = videoUrl;
      });
    },

    /* ---------- FFmpeg 本地视频处理(服务端 bin/ffmpeg,输入须为本站 /uploads/ 路径) ----------
     * billingAction/operationId(可选):服务端白名单计费(同族端点不同用途价不同,如智能修片 ff.hdStd/ff.hdPro;
     * 缺省回退端点默认动作)。opts 统一为末位可选对象,兼容旧位置参数调用。
     * 全部经 _withRecover 包装(R15):超时先即时认领一次服务端结果;失败统一附 err.__opId(同 genImage/genVideo 约定) */
    /* 抽帧:count 数字=均匀抽帧;或传对象 {times:[秒]} 定点抽帧(拉片场景段中点) */
    ffFrames(video, count, billingAction, operationId) { const o = (count && typeof count === 'object') ? count : { count }; return this._withRecover(operationId, () => this._req('/api/ffmpeg/frames', { method: 'POST', body: JSON.stringify(Object.assign({ video, billingAction, operationId }, o)) }, 180000)); },
    /* 字幕擦除(mode: 对白字幕擦除/全局字幕擦除) → {url} */
    ffSuberase(video, mode, billingAction, operationId) { return this._withRecover(operationId, () => this._req('/api/ffmpeg/suberase', { method: 'POST', body: JSON.stringify({ video, mode, billingAction, operationId }) }, 600000)); },
    /* 视频超清(res: 720P/1080P/2K/4K;quality: 'pro'=高码率慢压强锐化) → {url,res} */
    ffUpscale(video, res, quality, billingAction, operationId) { return this._withRecover(operationId, () => this._req('/api/ffmpeg/upscale', { method: 'POST', body: JSON.stringify({ video, res, quality, billingAction, operationId }) }, 600000)); },
    /* 高光智剪 → {url,segments,scenes,duration} */
    ffHighlight(video, opts, billingAction, operationId) { return this._withRecover(operationId, () => this._req('/api/ffmpeg/highlight', { method: 'POST', body: JSON.stringify(Object.assign({ video, billingAction, operationId }, opts || {})) }, 600000)); },
    /* 合成成片 items:[{video?|image?,dur?,text?,transition?}] → {url,count,transitions}(每段规格化+拼接+可选字幕烧录+真实转场) */
    ffCompose(items, ratio, subtitle, billingAction, operationId) { return this._withRecover(operationId, () => this._req('/api/ffmpeg/compose', { method: 'POST', body: JSON.stringify({ items, ratio, subtitle, billingAction, operationId }) }, 600000)); },
    /* 音视频合并 → {url} */
    ffMerge(video, audio, billingAction, operationId) { return this._withRecover(operationId, () => this._req('/api/ffmpeg/merge', { method: 'POST', body: JSON.stringify({ video, audio, billingAction, operationId }) }, 300000)); },
    /* 视频剪辑:保留 segments[{start,end}] 并拼接 → {url,segments} */
    ffCut(video, segments, billingAction, operationId) { return this._withRecover(operationId, () => this._req('/api/ffmpeg/cut', { method: 'POST', body: JSON.stringify({ video, segments, billingAction, operationId }) }, 600000)); },

    /* 豆包语音合成 TTS:{text,voice(voice_type),speed?,volume?,emotion?,emotionScale?,billingAction?,operationId?} → {url,duration}
     * 经 _withRecover 包装(R15):超时先即时认领;失败统一附 err.__opId */
    genTTS(opt) { opt = opt || {}; return this._withRecover(opt.operationId, () => this._req('/api/volc/tts', { method: 'POST', body: JSON.stringify(opt) }, 130000)); },

    /* 截帧并上传服务端(返回 /uploads/ 短路径,避免 base64 撑爆 localStorage);失败回退 dataURL/null */
    async captureFrameUp(videoUrl, tSec, name) {
      const dataUrl = await this.captureFrame(videoUrl, tSec);
      if (!dataUrl) return null;
      if (window.U && U.uploadData) {
        const up = await U.uploadData(name || ('frame_' + Date.now() + '.jpg'), dataUrl);
        if (up) return up;
      }
      return dataUrl;
    },

    /* 上游错误 → 制作向中文诊断:{msg 原文, advice 调整建议}(提示词违禁/超时/限流/参考图/参数等) */
    friendlyError(e) {
      const msg = String((e && e.message) || e || '未知错误');
      let advice;
      if (/违禁|敏感|审核|不合规|risk|moderat|nsfw|policy|illegal|violat/i.test(msg))
        advice = '提示词或参考图触发了内容安全审核(模型拒绝生成)。① 检查提示词是否含敏感词(可用内容安全自检,见「偏好学习 → 内容安全规范」);② 含真人肖像的素材需先完成「肖像白名单认证」并提交真人审核报白;③ 到「偏好学习 → 内容安全规范」查看四类红线。修改提示词或更换参考图后重新生成。';
      else if (/超时|timeout|timed out/i.test(msg))
        advice = '上游生成超时(任务排队或耗时过长)。可稍后重试,或缩短时长、简化提示词。';
      else if (/限流|429|quota|额度|频率/i.test(msg))
        advice = '上游限流或套餐额度不足。稍等片刻再试;频繁出现请检查火山引擎套餐余量。';
      else if (/参考图|参考视频|image|video_url|refVideo/i.test(msg))
        advice = '参考素材异常(不存在/格式不支持/上游无法拉取)。检查首帧图或参考视频后重试。';
      else if (/参数|parameter|invalid|bad request|不支持/i.test(msg))
        advice = '参数被上游拒绝(可能是比例/时长/模型组合不支持)。调整时长、比例或切换模型后重试。';
      else if (/网络|连接|connect|econn|socket|fetch/i.test(msg))
        advice = '网络连接异常。检查本地网络与 node server.js 后端是否在线后重试。';
      else
        advice = '模型执行异常。可调整提示词后重新生成;若持续失败,请把上面的原始错误信息反馈给管理员排查。';
      return { msg, advice };
    },
  };
  window.Media = Media;
})();
