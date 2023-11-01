const s:suite = themis#suite('expand:')
const s:assert = themis#helper('assert')

function! s:expect(expand) abort
  let f = #{ expand: a:expand  }
  function! f.suite(cmdline) abort
    let ctx = #{
          \ cmdline: a:cmdline,
          \ pos: 0,
          \ cmd: '',
          \ expand: '',
          \ }
    call wilder#cmdline#main#do(ctx)
    call s:assert.equals(ctx.expand, self.expand)
  endfunction
  return f.suite
endfunction

function s:suite.nothing() abort
  const Nothing = s:expect('nothing')
  call Nothing('" edit ')
  call Nothing('edit "')
endfunction

function s:suite.edit() abort
  const File = s:expect('file')
  call File('edit ')
  call File('e ')
  call File('!ls ')
endfunction

function s:suite.help()
  const Help = s:expect('help')
  call Help('help ')
endfunction
