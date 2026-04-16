//go:build !windows

package config

import "os"

func replaceFile(sourcePath, targetPath string) error {
	return os.Rename(sourcePath, targetPath)
}
