local filepath, line, col = ...
local bufnr = vim.fn.bufadd(filepath)
vim.fn.bufload(bufnr)

vim.api.nvim_buf_call(bufnr, function()
	if vim.bo[bufnr].filetype == "" then
		vim.cmd("filetype detect")
	end
end)

if not vim.wait(3000, function()
	return #vim.lsp.get_clients({ bufnr = bufnr }) > 0
end, 100) then
	return { error = "No LSP client attached to " .. filepath .. " (timed out)" }
end

local params = {
	textDocument = { uri = vim.uri_from_fname(filepath) },
	position = { line = line - 1, character = col - 1 },
}
local results = vim.lsp.buf_request_sync(bufnr, "textDocument/definition", params, 5000)
if not results then
	return { error = "LSP definition request timed out" }
end

local defs = {}
for _, res in pairs(results) do
	if res.result then
		local items = res.result
		if items.uri then
			items = { items }
		end
		for _, loc in ipairs(items) do
			local def_file = vim.uri_to_fname(loc.uri or loc.targetUri or "")
			local range = loc.range or loc.targetRange
			local def_line = range and (range.start.line + 1) or 0
			local def_col = range and (range.start.character + 1) or 0
			local sig = ""
			local db = vim.fn.bufadd(def_file)
			vim.fn.bufload(db)
			local lines = vim.api.nvim_buf_get_lines(db, def_line - 1, def_line, false)
			sig = lines[1] and vim.trim(lines[1]) or ""
			table.insert(defs, { file = def_file, line = def_line, col = def_col, signature = sig })
		end
	end
end
return defs
