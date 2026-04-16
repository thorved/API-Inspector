//go:build windows

package config

import (
	"fmt"
	"syscall"
	"unsafe"
)

const (
	moveFileReplaceExisting = 0x1
	moveFileWriteThrough    = 0x8
)

var (
	kernel32        = syscall.NewLazyDLL("kernel32.dll")
	moveFileExWProc = kernel32.NewProc("MoveFileExW")
)

func replaceFile(sourcePath, targetPath string) error {
	sourcePtr, err := syscall.UTF16PtrFromString(sourcePath)
	if err != nil {
		return fmt.Errorf("encode source path: %w", err)
	}

	targetPtr, err := syscall.UTF16PtrFromString(targetPath)
	if err != nil {
		return fmt.Errorf("encode target path: %w", err)
	}

	result, _, callErr := moveFileExWProc.Call(
		uintptr(unsafe.Pointer(sourcePtr)),
		uintptr(unsafe.Pointer(targetPtr)),
		uintptr(moveFileReplaceExisting|moveFileWriteThrough),
	)
	if result == 0 {
		if callErr != syscall.Errno(0) {
			return callErr
		}
		return syscall.EINVAL
	}

	return nil
}
